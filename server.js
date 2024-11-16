const express = require('express');
const puppeteer = require('puppeteer');

const app = express();
const PORT = process.env.PORT || 3000;

let browser;

// إعداد المتصفح عند بدء الخادم
(async () => {
    try {
        browser = await puppeteer.launch({
            headless: true,
            args: [
                '--no-sandbox', 
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu',
                '--window-size=800,600',
                '--disk-cache-size=0',
                '--disable-cache',
                '--disable-extensions',
                '--disable-background-timer-throttling',
                '--disable-backgrounding-occluded-windows',
                '--disable-renderer-backgrounding',
                '--enable-features=NetworkService,NetworkServiceInProcess',
            ],
        });
        console.log('Browser launched successfully');
    } catch (error) {
        console.error('Failed to launch browser:', error);
        process.exit(1); // إنهاء العملية إذا لم يتمكن من إطلاق المتصفح
    }
})();

// وظيفة استخراج رابط الصورة مع إعادة المحاولة
async function extractImage(url, retries = 2) {
    if (!browser) {
        console.error('Browser is not available');
        return null;
    }

    let page;
    try {
        page = await browser.newPage();

        // اعتراض الطلبات لتعطيل التحميلات غير الضرورية
        await page.setRequestInterception(true);
        page.on('request', (req) => {
            if (['image', 'stylesheet', 'font', 'media', 'script'].includes(req.resourceType())) {
                req.abort();
            } else {
                req.continue();
            }
        });

        // الذهاب إلى رابط الموقع
        await page.goto('https://savetwitter.net/en', { waitUntil: 'domcontentloaded', timeout: 10000 });

        // إدخال الرابط في الحقل
        await page.type('#s_input', url, { delay: 100 });

        // الضغط على زر "Download"
        await page.click('button.btn-red');

        // الانتظار حتى تختفي رسالة "Retrieving data, please wait a few seconds!"
        await page.waitForFunction(() => {
            const message = document.querySelector('div.message');
            return !message || message.style.display === 'none';
        }, { timeout: 20000 });

        // الانتظار حتى تظهر الصورة
        await page.waitForSelector('div.image-tw.open-popup img', { timeout: 15000 });

        // استخراج رابط الصورة
        const imageUrl = await page.$eval('div.image-tw.open-popup img', img => img.src);

        return imageUrl;

    } catch (error) {
        console.error('Error extracting image:', error);
        if (retries > 0) {
            console.log(`Retrying... (${retries} attempts left)`);
            return extractImage(url, retries - 1);
        }
        return null;
    } finally {
        if (page) {
            await page.close();
        }
    }
}

// إعداد نقطة النهاية لخدمة استخراج الصورة
app.get('/extract-image', async (req, res) => {
    const { url } = req.query;

    if (!url) {
        return res.status(400).send('URL is required');
    }

    console.log(`Received request to extract image for: ${url}`);

    try {
        let imageUrl = await extractImage(url);

        if (imageUrl) {
            res.send(`<a href="${imageUrl}">${imageUrl}</a>`);
        } else {
            res.status(500).send('Failed to extract image after multiple attempts');
        }
    } catch (error) {
        console.error('Unexpected error:', error);
        res.status(500).send('An unexpected error occurred');
    }
});

// بدء تشغيل الخادم
app.listen(PORT, () => {
    console.log(`Server is running at http://localhost:${PORT}`);
});
