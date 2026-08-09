// backend/models/Store.js
// نموذج المتجر الرسمي على منصة سوقنا
// كل الحقول الحساسة (owner, admins, isVerified) لا يجب أن تُعدَّل مباشرة
// من أي طلب قادم من العميل — فقط عبر منطق سيرفر صريح ومحمي.

const mongoose = require("mongoose");
const { Schema } = mongoose;

const StoreAdminSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true },
    // manager: يقدر ينشر/يعدّل/يحذف منتجات
    // viewer: صلاحية اطّلاع فقط (مستقبلاً، غير مستخدمة بالنشر)
    role: { type: String, enum: ["manager", "viewer"], default: "manager" },
    // يسمح للمالك بتعطيل صلاحية مشرف مؤقتاً دون حذفه
    isActive: { type: Boolean, default: true },
    addedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const StoreSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    slug: { type: String, required: true, unique: true, index: true, lowercase: true },
    description: { type: String, maxlength: 2000 },
    logoUrl: { type: String },
    coverImageUrl: { type: String },
    category: { type: String, index: true },

    // مالك المتجر — الحساب الوحيد صاحب الصلاحية الكاملة (تعديل بيانات المتجر،
    // إضافة/إزالة مشرفين، حذف المتجر). لا يمكن نقل الملكية إلا عبر مسار إداري منفصل.
    owner: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },

    // مشرفون معتمدون من المالك، صلاحياتهم أضيق (نشر/تعديل منتجات فقط)
    admins: [StoreAdminSchema],

    // شارة التوثيق: لا تُفعَّل إلا من لوحة تحكم إدارة سوقنا (Super Admin)
    // وليس من المالك نفسه — تمنع أي متجر من "توثيق نفسه"
    isVerified: { type: Boolean, default: false },
    verifiedAt: { type: Date, default: null },
    verifiedBy: { type: Schema.Types.ObjectId, ref: "User", default: null }, // مشرف سوقنا

    contact: {
      whatsapp: { type: String, trim: true },
      phone: { type: String, trim: true },
      address: { type: String, trim: true },
      location: {
        lat: { type: Number },
        lng: { type: Number },
      },
    },

    policies: {
      warrantyText: { type: String, maxlength: 3000 },
      returnPolicyText: { type: String, maxlength: 3000 },
      warrantyPeriodDays: { type: Number, default: null },
    },

    isActive: { type: Boolean, default: true }, // تعطيل كامل للمتجر (إداري)
  },
  { timestamps: true }
);

// فهرس نصي للبحث عن المتاجر
StoreSchema.index({ name: "text", description: "text" });

module.exports = mongoose.model("Store", StoreSchema);
