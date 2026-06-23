import { useState, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { useFeedback } from '../context/FeedbackContext';
import { supabase } from '../lib/supabase';
import { X, Upload, FileText, Loader2, Sparkles, CheckCircle } from 'lucide-react';
import DocumentStatusBadge, { getDocumentStatus } from './DocumentStatusBadge';

const DOCUMENT_TYPES = [
  { id: 'commercial_registration', label: 'السجل التجاري', fields: ['document_number', 'company_name', 'company_type', 'activity', 'city', 'issue_date', 'expiry_date', 'issuer'] },
  { id: 'transport_license', label: 'رخصة هيئة النقل', fields: ['document_number', 'activity_type', 'company_name', 'issue_date', 'expiry_date', 'issuer'] },
  { id: 'vat_certificate', label: 'شهادة ضريبة القيمة المضافة', fields: ['tax_number', 'company_name', 'registration_date', 'status', 'issuer'] },
  { id: 'zakat_certificate', label: 'شهادة الزكاة والدخل', fields: ['certificate_number', 'company_name', 'issue_date', 'expiry_date', 'status'] },
  { id: 'social_insurance', label: 'شهادة التأمينات الاجتماعية', fields: ['subscription_number', 'company_name', 'issue_date', 'expiry_date', 'status'] },
  { id: 'tawteen_certificate', label: 'شهادة التوطين', fields: ['certificate_number', 'company_name', 'tawteen_scope', 'issue_date', 'expiry_date', 'status', 'issuer'] },
  { id: 'national_address', label: 'العنوان الوطني', fields: ['building_number', 'street_name', 'district', 'city', 'postal_code', 'additional_number', 'unit_number', 'short_address'] },
  { id: 'iban_certificate', label: 'شهادة الآيبان البنكي', fields: ['bank_name', 'account_holder', 'iban_number', 'currency', 'verification_status', 'file_url'] },
  { id: 'owner_id', label: 'هوية المالك', fields: ['name', 'id_number', 'expiry_date', 'role', 'file_url'] },
  { id: 'authorized_id', label: 'هوية المفوض', fields: ['name', 'id_number', 'expiry_date', 'role', 'file_url'] },
  { id: 'authorization', label: 'التفويض الرسمي', fields: ['authorized_name', 'id_number', 'authorization_type', 'issue_date', 'expiry_date'] },
  { id: ' founding_contract', label: 'عقد التأسيس', fields: ['document_number', 'company_name', 'issue_date', 'expiry_date', 'issuer'] },
  { id: 'chamber_certificate', label: 'شهادة الغرفة التجارية', fields: ['certificate_number', 'company_name', 'issue_date', 'expiry_date', 'status'] },
  { id: 'other', label: 'أخرى', fields: ['document_name', 'document_number', 'company_name', 'issue_date', 'expiry_date', 'notes'] }
];

export default function DocumentFormModal({ document, onClose, onSuccess }) {
  const { user, profile } = useAuth();
  const { data } = useData();
  const { success, error, warning } = useFeedback();
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
  const fileInputRef = useRef(null);

  const [formData, setFormData] = useState({
    document_type: document?.document_type || '',
    document_name: document?.document_name || '',
    document_number: document?.document_number || '',
    company_name: document?.company_name || '',
    issuer: document?.issuer || '',
    issue_date: document?.issue_date || '',
    expiry_date: document?.expiry_date || '',
    status: document?.status || 'active',
    notes: document?.notes || '',
    file_url: document?.file_url || '',
    file_name: document?.file_name || '',
    file_type: document?.file_type || '',
    file_size: document?.file_size || null,
    extracted_data: document?.extracted_data || {},
    ...document
  });

  const [extractedBadge, setExtractedBadge] = useState(false);

  const getRoles = () => {
    if (!profile) return [];
    if (Array.isArray(profile.roles)) return profile.roles;
    if (typeof profile.roles === 'string' && profile.roles.startsWith('[')) {
      try { return JSON.parse(profile.roles); } catch { return []; }
    }
    return [];
  };

  const isAdmin = profile?.role === 'admin' || profile?.role === 'director' || getRoles().includes('admin');

  const selectedType = DOCUMENT_TYPES.find(t => t.id === formData.document_type);

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (extractedBadge && field !== 'document_type') {
      setExtractedBadge(false);
    }
  };

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const allowedTypes = ['application/pdf', 'image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      warning('نوع الملف غير مدعوم. استخدم PDF أو PNG أو JPG أو WEBP');
      return;
    }

    setIsUploading(true);
    try {
      const timestamp = Date.now();
      const fileName = `${timestamp}-${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
      const filePath = `${formData.document_type || 'general'}/${fileName}`;

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('company-documents')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: false
        });

      if (uploadError) {
        console.error('Upload error:', uploadError);
        error('تعذر رفع الملف');
        setIsUploading(false);
        return;
      }

      const { data: urlData } = supabase.storage
        .from('company-documents')
        .getPublicUrl(filePath);

      setFormData(prev => ({
        ...prev,
        file_url: urlData.publicUrl,
        file_name: file.name,
        file_type: file.type,
        file_size: file.size
      }));

      success('تم رفع الملف بنجاح');
    } catch (err) {
      console.error('File upload error:', err);
      error('تعذر رفع الملف');
    } finally {
      setIsUploading(false);
    }
  };

  const handleExtractData = async () => {
    if (!formData.file_url) {
      warning('يرجى رفع الملف أولاً');
      return;
    }

    setIsExtracting(true);
    await new Promise(resolve => setTimeout(resolve, 1500));
    setIsExtracting(false);
    setExtractedBadge(true);
    warning('سيتم تفعيل الاستخراج الذكي بعد ربط مزود الذكاء الاصطناعي');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!formData.document_type) {
      warning('يرجى اختيار نوع المستند');
      return;
    }

    if (!formData.document_name) {
      const typeLabel = selectedType?.label || 'المستند';
      setFormData(prev => ({ ...prev, document_name: typeLabel }));
    }

    setIsSaving(true);

    try {
      const computedStatus = getDocumentStatus(
        formData.expiry_date,
        !!formData.file_url,
        !!formData.document_name && !!formData.document_type
      );

      const documentData = {
        document_type: formData.document_type,
        document_name: formData.document_name || selectedType?.label,
        document_number: formData.document_number || null,
        company_name: formData.company_name || null,
        issuer: formData.issuer || null,
        issue_date: formData.issue_date || null,
        expiry_date: formData.expiry_date || null,
        status: computedStatus,
        file_url: formData.file_url || null,
        file_name: formData.file_name || null,
        file_type: formData.file_type || null,
        file_size: formData.file_size || null,
        extracted_data: formData.extracted_data || {},
        notes: formData.notes || null,
        updated_at: new Date().toISOString()
      };

      let result;
      if (document?.id) {
        result = await supabase
          .from('company_documents')
          .update(documentData)
          .eq('id', document.id);
      } else {
        documentData.created_by = user?.id;
        documentData.created_at = new Date().toISOString();
        result = await supabase
          .from('company_documents')
          .insert(documentData);
      }

      if (result.error) {
        console.error('Document save error:', result.error);
        error('تعذر حفظ المستند');
        setIsSaving(false);
        return;
      }

      success(document?.id ? 'تم تحديث المستند بنجاح' : 'تم حفظ المستند بنجاح');
      onSuccess?.();
      onClose();
    } catch (err) {
      console.error('Document save error:', err);
      error('تعذر حفظ المستند');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-800 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden shadow-2xl">
        <div className="p-6 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center">
              <FileText className="w-5 h-5 text-blue-500" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">
                {document?.id ? 'تعديل المستند' : 'إضافة مستند جديد'}
              </h2>
              <p className="text-sm text-slate-500">أرشيف مركزي لوثائق شركة عزم</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-700 flex items-center justify-center hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
          >
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto max-h-[calc(90vh-180px)]">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">نوع المستند *</label>
              <select
                value={formData.document_type}
                onChange={(e) => handleChange('document_type', e.target.value)}
                className="input-field"
                required
              >
                <option value="">اختر نوع المستند</option>
                {DOCUMENT_TYPES.map(type => (
                  <option key={type.id} value={type.id}>{type.label}</option>
                ))}
              </select>
            </div>

            <div className="col-span-2">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">اسم المستند</label>
              <input
                type="text"
                value={formData.document_name}
                onChange={(e) => handleChange('document_name', e.target.value)}
                className="input-field"
                placeholder="اتركه فارغاً ليعتمد على النوع"
              />
            </div>

            {formData.document_type && (
              <>
                {selectedType?.fields.includes('document_number') && (
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">رقم الوثيقة</label>
                    <input
                      type="text"
                      value={formData.document_number || ''}
                      onChange={(e) => handleChange('document_number', e.target.value)}
                      className="input-field"
                    />
                  </div>
                )}

                {selectedType?.fields.includes('company_name') && (
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">اسم المنشأة</label>
                    <input
                      type="text"
                      value={formData.company_name || ''}
                      onChange={(e) => handleChange('company_name', e.target.value)}
                      className="input-field"
                    />
                  </div>
                )}

                {selectedType?.fields.includes('issuer') && (
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">الجهة المصدرة</label>
                    <input
                      type="text"
                      value={formData.issuer || ''}
                      onChange={(e) => handleChange('issuer', e.target.value)}
                      className="input-field"
                    />
                  </div>
                )}

                {selectedType?.fields.includes('issue_date') && (
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">تاريخ الإصدار</label>
                    <input
                      type="date"
                      value={formData.issue_date || ''}
                      onChange={(e) => handleChange('issue_date', e.target.value)}
                      className="input-field"
                    />
                  </div>
                )}

                {selectedType?.fields.includes('expiry_date') && (
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">تاريخ الانتهاء</label>
                    <input
                      type="date"
                      value={formData.expiry_date || ''}
                      onChange={(e) => handleChange('expiry_date', e.target.value)}
                      className="input-field"
                    />
                  </div>
                )}
              </>
            )}

            <div className="col-span-2">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">ملاحظات</label>
              <textarea
                value={formData.notes || ''}
                onChange={(e) => handleChange('notes', e.target.value)}
                className="input-field min-h-[80px]"
                placeholder="ملاحظات إضافية..."
              />
            </div>

            <div className="col-span-2">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">رفع ملف</label>
              <div 
                className="border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-xl p-6 text-center cursor-pointer hover:border-blue-400 dark:hover:border-blue-500 transition-colors"
                onClick={() => fileInputRef.current?.click()}
              >
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  accept=".pdf,.png,.jpg,.jpeg,.webp"
                  className="hidden"
                />
                {formData.file_url ? (
                  <div className="flex items-center justify-center gap-3">
                    <CheckCircle className="w-8 h-8 text-green-500" />
                    <div className="text-right">
                      <p className="font-medium text-slate-800 dark:text-slate-100">{formData.file_name}</p>
                      <p className="text-sm text-slate-500">تم الرفع بنجاح</p>
                    </div>
                  </div>
                ) : isUploading ? (
                  <div className="flex items-center justify-center gap-3">
                    <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
                    <p className="text-slate-500">جاري رفع الملف...</p>
                  </div>
                ) : (
                  <div>
                    <Upload className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                    <p className="text-slate-500">اضغط لرفع ملف PDF أو صورة</p>
                    <p className="text-xs text-slate-400 mt-1">PDF, PNG, JPG, WEBP</p>
                  </div>
                )}
              </div>
            </div>

            {formData.file_url && (
              <div className="col-span-2">
                <button
                  type="button"
                  onClick={handleExtractData}
                  disabled={isExtracting}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl border-2 border-purple-200 dark:border-purple-900 text-purple-600 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/20 transition-colors disabled:opacity-50"
                >
                  {isExtracting ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      <span>جاري الاستخراج...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-5 h-5" />
                      <span>استخراج البيانات بالذكاء الاصطناعي</span>
                    </>
                  )}
                </button>
                {extractedBadge && (
                  <div className="mt-2 px-4 py-2 bg-purple-50 dark:bg-purple-900/20 rounded-xl border border-purple-200 dark:border-purple-800">
                    <p className="text-sm text-purple-600 dark:text-purple-400 text-center">
                      تم الاستخراج تلقائيًا — يرجى المراجعة
                    </p>
                  </div>
                )}
              </div>
            )}

            {formData.expiry_date && (
              <div className="col-span-2">
                <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl">
                  <span className="text-sm text-slate-500">الحالة المحسوبة: </span>
                  <DocumentStatusBadge status={getDocumentStatus(formData.expiry_date, !!formData.file_url, !!formData.document_name)} />
                </div>
              </div>
            )}
          </div>

          <div className="flex gap-3 pt-4">
            <button 
              type="submit" 
              disabled={isSaving}
              className="btn-primary flex-1 flex items-center justify-center gap-2"
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>جاري الحفظ...</span>
                </>
              ) : (
                <>
                  <FileText className="w-5 h-5" />
                  <span>حفظ المستند</span>
                </>
              )}
            </button>
            <button 
              type="button" 
              onClick={onClose}
              className="btn-secondary"
            >
              إلغاء
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}