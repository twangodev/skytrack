let chart;

const intToString = n => {
  if (n < 1e3) return n;
  if (n >= 1e3 && n < 1e6) return +(n / 1e3).toFixed(3) + "K";
  if (n >= 1e6 && n < 1e9) return +(n / 1e6).toFixed(3) + "M";
  if (n >= 1e9 && n < 1e12) return +(n / 1e9).toFixed(3) + "B";
  if (n >= 1e12) return +(n / 1e12).toFixed(3) + "T";
};

const chartConfig = {
    type: 'line',
    data: {
        datasets: [
            {
                label: 'Sell',
                data: [],
                borderColor: '#BF616A',
                fill: false,
                stepped: 'after'
            },
            {
                label: 'Buy',
                data: [],
                borderColor: '#A3BE8C',
                fill: false,
                stepped: 'after'
            }

        ]
    },
    options: {
        scales: {
            x: {
                type: 'linear',
            },
            y: {
                type: 'logarithmic',
                display: false,
            }
        },
        responsive: true,
        interaction: {
            intersect: false,
            axis: 'x'
        },
        maintainAspectRatio: false
    }
}

window.onload = () => {

    chart = new Chart(document.getElementById('chart'), chartConfig)

    const params = Object.fromEntries(new URLSearchParams(window.location.search).entries());
    const product = params.product

    function updateQuickStatistics(qsJSON, sectionID) {
        ['price', 'volume', 'moving-week', 'orders'].forEach((value) => {
            const element = document.getElementById(`${sectionID}-${value}`)
            const parsedValue = qsJSON[value];
            let rawOldValue = element.getAttribute('value')
            if (rawOldValue != null) rawOldValue = "0"
            const oldValue = parseFloat(rawOldValue)

            let className = 'quick-statistic-value';
            if (parsedValue === oldValue) return
            if (parsedValue > oldValue) className += ' up'
            if (parsedValue < oldValue) className += ' down'

            element.innerText = intToString(parsedValue)
            element.setAttribute('value', parsedValue)
            element.className = className

        })
    }

    function updateChartData(summaryData, chartIndex) {
        chart.data.datasets[chartIndex].data = []

        let previousElementsSum = 0;
        const data = [];
        summaryData.forEach((transaction) => {
            data.push({x: transaction.pricePerUnit, y: transaction.amount + previousElementsSum})
            previousElementsSum += transaction.amount
        })
        chart.data.datasets[chartIndex].data = data
    }

    function getQuantile(array, quantile) {
        let index = quantile / 100.0 * (array.length - 1);

        if (index % 1 === 0) {
            return array[index];
        } else {
            let lowerIndex = Math.floor(index);
            let remainder = index - lowerIndex;
            return array[lowerIndex] + remainder * (array[lowerIndex + 1] - array[lowerIndex]);
        }
    }

    function updateTableData(summaryData, type) {
        const chart = document.getElementById(`${type}-table`)
        chart.innerHTML = '<tr><th>Price Per Unit (PPU)</th><th>Orders</th><th>Amount</th><th>Market Value</th></tr>'
        summaryData.forEach((transaction, index) => {
            const {
                pricePerUnit: ppu,
                orders,
                amount
            } = transaction
            const marketValue = ppu * amount
            const html = `<tr><td>${intToString(ppu)}</td><td>${intToString(orders)}</td><td>${intToString(amount)}</td><td>${intToString(marketValue)}</td></tr>`
            chart.insertAdjacentHTML('beforeend', html)
        })
    }


    function updateData(json) {

        const productJSON = json.products[product];
        ['buy-container', 'sell-container'].forEach((containerID, index) => {
            const qs = productJSON.quick_status
            const type = containerID.replace('-container', '')
            const qsJSON = {
                'price': parseFloat(qs[`${type}Price`]).toFixed(3),
                'volume': qs[`${type}Volume`],
                'moving-week': qs[`${type}MovingWeek`],
                'orders': qs[`${type}Orders`]
            }
            updateQuickStatistics(qsJSON, containerID)
            let summaryData = productJSON[`${type}_summary`]

            updateTableData(summaryData, type)

            const sortedPPU = summaryData.map(item => item.pricePerUnit).slice().sort((a, b) => a - b)
            const q1 = getQuantile(sortedPPU, 25)
            const q3 = getQuantile(sortedPPU, 75)

            const iqr = q3 - q1
            const max = q3 + iqr * 0.05
            const min = q1 - iqr * 1.5

            const summaryDataWO = summaryData.filter(item => (item.pricePerUnit >= min) && (item.pricePerUnit <= max))

            updateChartData(summaryDataWO, index)

        })

        chart.update()

    }

    const readableProduct = product.split('_').map(word =>
        word.charAt(0).toUpperCase() + word.toLowerCase().slice(1)
    ).join(' ')
    get((firstJSON) => {
        if (Object.keys(firstJSON.products).includes(product)) {
            const blinker = '<span class="live-indicator"><i class="fa fa-circle blink" aria-hidden="true"></i>Live</span>'
            document.getElementById('advanced-header').innerHTML = `${readableProduct} Data ${blinker}`
            updateData(firstJSON, true)

            setInterval(() => {
                get((json) => {
                    updateData(json)
                })
            }, 1000)
        } else {
            document.getElementById('data').style.display = 'none'
            document.getElementById('error-header').innerText = `"${readableProduct}" is not a valid product and could not be found`
            document.getElementById('error-container').style.display = 'block'
        }
    })
}