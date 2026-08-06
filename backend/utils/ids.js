const mongoose = require('mongoose');

function isValidObjectId(id) {
  return Boolean(id) && mongoose.Types.ObjectId.isValid(id) && String(id).length === 24;
}

function sameOrg(a, b) {
  return Boolean(a) && Boolean(b) && String(a) === String(b);
}

module.exports = { isValidObjectId, sameOrg };
