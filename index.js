window.onload = () => {
    get((json) => {
        Object.keys(json.products).sort().forEach((product) => {
            const readableProduct = product.split('_').map((word) =>
                word.charAt(0).toUpperCase() + word.toLowerCase().slice(1)
            ).join(' ')
            const html = `<a class="item-selector" href="advanced?product=${product}">${readableProduct}</a>`
            document.getElementById('item-selector-container').insertAdjacentHTML('beforeend', html)
        })
    })
}