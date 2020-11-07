const puppeteer = require('puppeteer')

main()
async function main() {
    const browser = await puppeteer.launch({headless: false, defaultViewport: null})
    await createAccount(browser)
    let urlarray = await getPageUrls(browser)
    await addItemsToCart(browser, urlarray)
    await checkoutCart(browser)
    await browser.close()
}

async function createAccount(browser) {
    const page = await browser.newPage()
    await page.goto('https://reg.usps.com/entreg/RegistrationAction_input', {waitUntil: 'networkidle2'})
    await page.waitForSelector('#registrationSuccessForm', {timeout: 0})
}

async function getPageUrls(browser) {

    let hrefarray = [];
    const page = await browser.newPage()
    console.log('Scraping all product URLs. This can take up to 10 minutes.')
    await page.goto('https://store.usps.com/store/results/free-shipping-supplies/shipping-supplies/_/N-alnx4jZ7d0v8v')

    while ((await page.$$('li[class="navigation next"] > a')).length > 0) {
        let array = await page.$$('div[class="result-page-image-holder quick-view-handler"] > a[class="d-flex justify-content-center"]')
        for (let i = 0; i < array.length; i++) {
            await array[i].getProperty('href').then((attrib) => {
                hrefarray.push(attrib._remoteObject.value)
            })
        }
        page.click('li[class="navigation next"] > a')
        await page.waitForNavigation({waitUntil: 'networkidle2'})
    }
    
    console.log("Dumped " + hrefarray.length + " URLs.")
    page.close()
    return hrefarray
}

async function addItemsToCart(browser, urlarray) {

    const page = await browser.newPage()
    for (let i = 0; i < urlarray.length; i++) {
        
        await page.goto(urlarray[i])
        let packagetype = await page.evaluate(function() {
            let packagetypearray = document.querySelectorAll('a[class="btn-primary button--white textbtn"]')
            if (packagetypearray.length > 0) {
                return packagetypearray[packagetypearray.length - 1].id
            } else {
                return null;
            } 
        })

        let maxquantity
        let cartid = await page.evaluate(function() {
            let elementarray = document.querySelectorAll('a[class="button--primary button--green button--cart add-to-cart"]')
            let element = elementarray[elementarray.length - 1]
            return element.id
        })
        
        
        if (packagetype !== null) {
            await page.click('a[id="' + packagetype + '"]')
            await page.type('#cartQuantity', '999999')
            await page.click('#' + cartid)
        } else {
            await page.type('#cartQuantity', '999999')
            await page.waitForSelector('a[class="button--primary button--green button--cart add-to-cart"]')
            await page.click('a[class="button--primary button--green button--cart add-to-cart"]')
        }

        await page.waitForSelector('#mult-error > p')
        maxquantity = await page.$eval('#mult-error > p', (element) => {
            return element.innerHTML
        })
        
        maxquantity = maxquantity.match(/[0-9]+/g)[0]
        let productname = await page.evaluate(() => {
            document.getElementById('cartQuantity').value = ""
            return document.querySelector('h2[class="d-none d-md-block selected-stamp-title"]').innerHTML
        })
        await page.type('#cartQuantity', maxquantity)
        if (packagetype !== null) {
            await page.click('#' + cartid)
        } else {
            await page.click('a[class="button--primary button--green button--cart add-to-cart"]')
        }
        console.log((i + 1) + "/" + urlarray.length + " | Added " + maxquantity + " of " + productname + " to cart.")
    }

    console.log("Finished adding items to cart.")
    await page.close()
}

async function checkoutCart(browser) {
    const page = await browser.newPage()
    page.goto('https://store.usps.com/store/cart/cart.jsp')
    

    await page.waitForNavigation({waitUntil: 'networkidle2'})
    await page.waitForTimeout(1000)
    await page.click('#atg_store_checkout')
    await page.waitForSelector('a[class="btn-primary ship-to-this-address-btn"]')
    await page.click('a[class="btn-primary ship-to-this-address-btn"]')
    await page.waitForNavigation({waitUntil: 'networkidle2'})
    await page.waitForTimeout(1000)
    await page.click('#placeMyOrderBtn')
    await page.waitForTimeout(1000)
    await page.click('#agree')
    console.log("Your order has been placed.")
}
