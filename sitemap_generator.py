import requests
from sitemap import Url, Urlset

home_url = "https://skytrack.twango.dev/"
advanced_url = "https://skytrack.twango.dev/advanced?product="

api_url = "https://api.hypixel.net/skyblock/bazaar"


def retrieve_products():
    response = requests.get(api_url).json()

    products = response["products"].keys()
    return sorted(products)


def generate_sitemap(products):
    url_set = Urlset()
    url = Url(home_url, changefreq='monthly')

    url_set.add_url(url)

    for product in products:
        url = Url(advanced_url + product, changefreq='monthly')
        url_set.add_url(url)

    return url_set


if __name__ == "__main__":
    products = retrieve_products()
    url_set = generate_sitemap(products)
    url_set.write_xml("sitemap.xml")
