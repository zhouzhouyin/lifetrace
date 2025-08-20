const mongoose = require('mongoose');

const noteSectionMediaSchema = new mongoose.Schema({
  type: { type: String, enum: ['image', 'video', 'audio'], required: true },
  url: { type: String, required: true },
  desc: { type: String, default: '' }
}, { _id: false });

const noteSectionSchema = new mongoose.Schema({
  title: { type: String, default: '' },
  text: { type: String, default: '' },
  media: { type: [noteSectionMediaSchema], default: [] }
}, { _id: false });

const noteSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  title: { type: String, default: '' },
  content: { type: String, required: true },
  sections: { type: [noteSectionSchema], default: [] },
  isPublic: { type: Boolean, default: false },
  cloudStatus: { type: String, default: 'Not Uploaded' },
  type: { type: String, enum: ['Note', 'Biography'], default: 'Note' },
  timestamp: { type: Date, default: Date.now },
  likes: { type: Number, default: 0 },
  url: { type: String },
  sharedWithFamily: { type: Boolean, default: false },
});

module.exports = mongoose.model('Note', noteSchema);

