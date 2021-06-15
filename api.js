function get(callback) {
    const xhr = new XMLHttpRequest()
    xhr.onreadystatechange = function () {
        let json;
        try {
            json = JSON.parse(xhr.responseText)
        } catch {
            json = undefined
        }
        if (json?.success === true) callback(json)
    }
    xhr.open('GET', 'https://api.hypixel.net/skyblock/bazaar', true)
    xhr.send()
}