const puppeteer = require('puppeteer')
const { Form } = require('enquirer')

main()
async function main() {
    const browser = await puppeteer.launch()
    let userinfo = await createAccount(browser)
    let urlarray = await getPageUrls(browser)
    await addItemsToCart(browser, urlarray)
    await checkoutCart(browser, userinfo)
    await browser.close()
}

async function createAccount(browser) {

    let userinfo
    const prompt = new Form ({
        name: 'signup',
        message: "Provide the following information to sign up to USPS (Address is for the package receiver):",
        choices: [
            {name: 'username', message: 'Username'},
            {name: 'password', message: 'Password'},
            {name: 'email', message: 'Email Address'},
            {name: 'phone', message: 'Phone Number'},
            {name: 'securityquestion1', message: 'First Security Question'},
            {name: 'securityquestion2', message: 'Second Security Question'},
            {name: 'firstname', message: 'First Name'},
            {name: 'lastname', message: 'Last Name'},
            {name: 'streetaddress', message: 'Street Address'},
            {name: 'city', message: 'City'},
            {name: 'state', message: 'State', initial: 'Use shortened version of state. (ex. NY)'},
        ]
    })

    userinfo = await prompt.run()
    const page = await browser.newPage()

    console.log(
        "If this hangs, the information provided was invalid. Make sure to provide the following: \n\n" +
        "Email address that has not been used on USPS\n" +
        "A valid address to ship the package to\n" +
        "A password using the policy: 1 uppercase and lowercase letter, 8-50 characters, 1 number, cannot match username.\n\n"
    )
    await page.goto('https://reg.usps.com/entreg/RegistrationAction_input', {waitUntil: 'networkidle2'})

    // Username and Password
    await page.type('#tuserName', userinfo.username)
    await page.type('#tPassword', userinfo.password)
    await page.type('#tPasswordRetype', userinfo.password)

    // Security Questions
    await page.select('select#ssec1', "1")
    await page.type('#tsecAnswer1', userinfo.securityquestion1)
    await page.type('#tsecAnswer1Match', userinfo.securityquestion1)
    await page.select('select#ssec2', "2")
    await page.type('#tsecAnswer2', userinfo.securityquestion2)
    await page.type('#tsecAnswer2Match', userinfo.securityquestion2)
    

    // Select personal account and enter information
    await page.click('#rAccount1')
    await page.type('#temail', userinfo.email)
    await page.type('#temailRetype', userinfo.email)
    await page.type('#tphone', userinfo.phone)
    await page.type('#tfName', userinfo.firstname)
    await page.type('#tlName', userinfo.lastname)

    // Enter address information (note this must be a valid address)
    await page.type('#taddress', userinfo.streetaddress)
    await page.type('#tcity', userinfo.city)
    await page.select('select#sstate', userinfo.state)
    
    // Check to see if the address is valid (note the address may still not be valid)
    try {
        await page.click('#a-address-step1')
        await page.waitForTimeout(1000)
        await page.click('#btn-submit')
    } catch {
        
        console.log("\n\nERROR: Invalid information supplied. The website returned the following:")

        page.on('console', (msg) => {
            console.log(msg._text)
        })

        await page.evaluate(function() {
            let errorarray = document.querySelectorAll('span.error-txt-blk')
            errorarray.forEach(loginerror => console.log(loginerror.innerText))
            return;
        })

        await browser.close()
        process.exit(1)
    }
    
    // Check if the account was created
    await page.waitForNavigation({waitUntil: 'networkidle2'})
    return userinfo;
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

async function checkoutCart(browser, userinfo) {
    const page = await browser.newPage()
    page.goto('https://store.usps.com/store/cart/cart.jsp')
    
    await page.waitForNavigation({waitUntil: 'networkidle2'})
    await page.click('#atg_store_checkout')
    await page.waitForNavigation({waitUntil: 'networkidle2'})
    await page.click('a[class="btn-primary ship-to-this-address-btn"]')
    await page.waitForNavigation({waitUntil: 'networkidle2'})
    await page.click('#placeMyOrderBtn')
    await page.waitForTimeout(1000)
    await page.click('#agree')
    console.log(
        "Your order has been placed.\n" +
        "To check the status of your order use the following information:\n" + 
        "Username: " + userinfo.username + "\n" +
        "Password: " + userinfo.password
    )
}