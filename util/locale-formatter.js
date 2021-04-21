const LocaleCurrency = require('locale-currency')

const formatMoneyString = (money, locale = 'en-US') => new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: LocaleCurrency.getCurrency(locale),
}).format(money);

module.exports = { formatMoneyString }