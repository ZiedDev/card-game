const crypto = require('crypto');

const generateRandomString = (length) => {
    return crypto.randomBytes(length).toString('hex')
}

module.exports = { generateRandomString: generateRandomString }