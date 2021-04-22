const formatMoneyString = (money, locale = 'en-US', currency = 'USD') => new Intl.NumberFormat(locale, {
    style: 'currency',
    currency
}).format(money);

module.exports = { formatMoneyString }