const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      default: 'Developer'
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true
    },
    password: {
      type: String,
      required: true,
      minlength: 6
    },
    role: {
      type: String,
      enum: ['personal', 'admin', 'employee'],
      default: 'personal'
    },
    organizationId: {
      type: String,
      default: null
    },
    department: {
      type: String,
      default: 'Engineering'
    },
    bio: {
      type: String,
      default: ''
    },
    skills: {
      type: [String],
      default: ['JavaScript', 'System Architecture', 'UI Design']
    },
    provider: {
      type: String,
      enum: ['email', 'google'],
      default: 'email'
    },
    theme: {
      type: String,
      default: 'light'
    }
  },
  { timestamps: true }
);

userSchema.pre('save', async function hashPassword(next) {
  if (!this.isModified('password') || !this.password) {
    return next();
  }
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

userSchema.methods.comparePassword = function comparePassword(candidate) {
  if (!this.password) return Promise.resolve(false);
  return bcrypt.compare(candidate, this.password);
};

userSchema.methods.toSafeObject = function toSafeObject() {
  return {
    id: this._id,
    name: this.name,
    email: this.email,
    role: this.role,
    organizationId: this.organizationId,
    department: this.department,
    bio: this.bio,
    skills: this.skills,
    provider: this.provider,
    theme: this.theme,
    createdAt: this.createdAt
  };
};

module.exports = mongoose.model('User', userSchema);
