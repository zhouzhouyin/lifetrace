const mongoose = require('mongoose');

const familyRequestSchema = new mongoose.Schema({
  requesterId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  targetId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  relationFromRequester: { type: String, default: '' },
  relationFromTarget: { type: String, default: '' },
  status: { type: String, enum: ['pending', 'accepted', 'rejected'], default: 'pending' },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});
familyRequestSchema.pre('save', function(next) { this.updatedAt = new Date(); next(); });

const FamilyRequest = mongoose.model('FamilyRequest', familyRequestSchema);

const familySchema = new mongoose.Schema({
  userAId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  userBId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  relationAtoB: { type: String, default: '' },
  relationBtoA: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now }
});
familySchema.index({ userAId: 1, userBId: 1 }, { unique: true });

const Family = mongoose.model('Family', familySchema);

module.exports = { Family, FamilyRequest };

