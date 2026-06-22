import { X, Download, Share2, Printer, Edit3, ExternalLink, FileText, Calendar, Building, Hash } from 'lucide-react';
import { useFeedback } from '../context/FeedbackContext';
import DocumentStatusBadge, { getDocumentStatus } from './DocumentStatusBadge';

export default function DocumentDetailsModal({ document, onClose, onEdit }) {
  const { success, error, info } = useFeedback();

  if (!document) return null;

  const computedStatus = getDocumentStatus(
    document.expiry_date,
    !!document.file_url,
    !!document.document_name
  );

  const formatDate = (dateStr) => {
    if (!dateStr) return 'غير محدد';
    return new Date(dateStr).toLocaleDateString('ar-SA', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const handleDownload = () => {
    if (!document.file_url) {
      info('لا يوجد ملف مرفق');
      return;
    }
    window.open(document.file_url, '_blank');
  };

  const handleShareWhatsApp = () => {
    if (!document.file_url) {
      error('لا يمكن مشاركة الرابط لأن الملف غير عام');
      return;
    }

    const message = `السلام عليكم،
مرفق بيانات مستند: ${document.document_name}
نوع المستند: ${getDocumentTypeLabel(document.document_type)}
رقم الوثيقة: ${document.document_number || 'غير محدد'}
اسم المنشأة: ${document.company_name || 'غير محدد'}
تاريخ الانتهاء: ${formatDate(document.expiry_date)}
رابط الملف: ${document.file_url}`;

    const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(message)}`;
    window.open(whatsappUrl, '_blank');
  };

  const handlePrint = () => {
    const printContent = `
      <!DOCTYPE html>
      <html dir="rtl">
      <head>
        <title>${document.document_name}</title>
        <style>
          body { font-family: 'Tajawal', sans-serif; padding: 40px; }
          h1 { color: #059669; border-bottom: 2px solid #059669; padding-bottom: 10px; }
          table { width: 100%; border-collapse: collapse; margin-top: 20px; }
          td { padding: 10px; border: 1px solid #e2e8f0; }
          td:first-child { font-weight: bold; background: #f8fafc; width: 30%; }
          .header { display: flex; align-items: center; gap: 15px; margin-bottom: 20px; }
          .logo { width: 50px; height: 50px; background: #059669; color: white; border-radius: 10px; display: flex; align-items: center; justify-content: center; font-size: 24px; }
          .footer { margin-top: 30px; font-size: 12px; color: #64748b; text-align: center; }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="logo">ع</div>
          <div>
            <h1>${document.document_name}</h1>
            <p>شركة عزم للخدمات اللوجستية</p>
          </div>
        </div>
        <table>
          <tr><td>نوع المستند</td><td>${getDocumentTypeLabel(document.document_type)}</td></tr>
          <tr><td>رقم الوثيقة</td><td>${document.document_number || 'غير محدد'}</td></tr>
          <tr><td>اسم المنشأة</td><td>${document.company_name || 'غير محدد'}</td></tr>
          <tr><td>الجهة المصدرة</td><td>${document.issuer || 'غير محدد'}</td></tr>
          <tr><td>تاريخ الإصدار</td><td>${formatDate(document.issue_date)}</td></tr>
          <tr><td>تاريخ الانتهاء</td><td>${formatDate(document.expiry_date)}</td></tr>
          <tr><td>الحالة</td><td>${computedStatus}</td></tr>
          ${document.notes ? `<tr><td>ملاحظات</td><td>${document.notes}</td></tr>` : ''}
        </table>
        <div class="footer">
          <p>تاريخ الطباعة: ${new Date().toLocaleDateString('ar-SA')}</p>
          <p>برنامج عزم للإنجاز والتشغيل</p>
        </div>
      </body>
      </html>
    `;

    const printWindow = window.open('', '_blank');
    printWindow.document.write(printContent);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
    }, 250);
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
              <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">{document.document_name}</h2>
              <p className="text-sm text-slate-500">تفاصيل المستند</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-700 flex items-center justify-center hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
          >
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto max-h-[calc(90vh-180px)]">
          <div className="mb-6">
            <DocumentStatusBadge status={computedStatus} />
          </div>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl">
                <div className="flex items-center gap-2 text-slate-500 mb-1">
                  <Hash className="w-4 h-4" />
                  <span className="text-sm">نوع المستند</span>
                </div>
                <p className="font-semibold text-slate-800 dark:text-slate-100">
                  {getDocumentTypeLabel(document.document_type)}
                </p>
              </div>

              <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl">
                <div className="flex items-center gap-2 text-slate-500 mb-1">
                  <FileText className="w-4 h-4" />
                  <span className="text-sm">رقم الوثيقة</span>
                </div>
                <p className="font-semibold text-slate-800 dark:text-slate-100">
                  {document.document_number || 'غير محدد'}
                </p>
              </div>

              <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl">
                <div className="flex items-center gap-2 text-slate-500 mb-1">
                  <Building className="w-4 h-4" />
                  <span className="text-sm">اسم المنشأة</span>
                </div>
                <p className="font-semibold text-slate-800 dark:text-slate-100">
                  {document.company_name || 'غير محدد'}
                </p>
              </div>

              <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl">
                <div className="flex items-center gap-2 text-slate-500 mb-1">
                  <Calendar className="w-4 h-4" />
                  <span className="text-sm">تاريخ الإصدار</span>
                </div>
                <p className="font-semibold text-slate-800 dark:text-slate-100">
                  {formatDate(document.issue_date)}
                </p>
              </div>

              <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl">
                <div className="flex items-center gap-2 text-slate-500 mb-1">
                  <Calendar className="w-4 h-4" />
                  <span className="text-sm">تاريخ الانتهاء</span>
                </div>
                <p className="font-semibold text-slate-800 dark:text-slate-100">
                  {formatDate(document.expiry_date)}
                </p>
              </div>

              <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl">
                <div className="flex items-center gap-2 text-slate-500 mb-1">
                  <Building className="w-4 h-4" />
                  <span className="text-sm">الجهة المصدرة</span>
                </div>
                <p className="font-semibold text-slate-800 dark:text-slate-100">
                  {document.issuer || 'غير محدد'}
                </p>
              </div>
            </div>

            {document.notes && (
              <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl">
                <p className="text-sm text-slate-500 mb-1">ملاحظات</p>
                <p className="text-slate-800 dark:text-slate-100">{document.notes}</p>
              </div>
            )}

            {document.file_url && (
              <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-xl border border-green-100 dark:border-green-900/30">
                <div className="flex items-center gap-2 text-green-600 mb-2">
                  <FileText className="w-5 h-5" />
                  <span className="font-medium">ملف مرفق</span>
                </div>
                <p className="text-sm text-slate-600 dark:text-slate-300">{document.file_name}</p>
              </div>
            )}
          </div>

          <div className="flex gap-3 mt-6 flex-wrap">
            <button
              onClick={handleDownload}
              disabled={!document.file_url}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 transition-colors disabled:opacity-50"
            >
              <Download className="w-5 h-5" />
              <span>تحميل</span>
            </button>

            <button
              onClick={handleShareWhatsApp}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-green-500 text-white hover:bg-green-600 transition-colors"
            >
              <Share2 className="w-5 h-5" />
              <span>مشاركة واتساب</span>
            </button>

            <button
              onClick={handlePrint}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-slate-600 text-white hover:bg-slate-700 transition-colors"
            >
              <Printer className="w-5 h-5" />
              <span>طباعة / PDF</span>
            </button>

            {onEdit && (
              <button
                onClick={() => { onClose(); onEdit(); }}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-blue-500 text-white hover:bg-blue-600 transition-colors"
              >
                <Edit3 className="w-5 h-5" />
                <span>تعديل</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function getDocumentTypeLabel(typeId) {
  const types = {
    'commercial_registration': 'السجل التجاري',
    'transport_license': 'رخصة هيئة النقل',
    'vat_certificate': 'شهادة ضريبة القيمة المضافة',
    'zakat_certificate': 'شهادة الزكاة والدخل',
    'social_insurance': 'شهادة التأمينات الاجتماعية',
    'tawteen_certificate': 'شهادة التوطين',
    'national_address': 'العنوان الوطني',
    'iban_certificate': 'شهادة الآيبان البنكي',
    'owner_id': 'هوية المالك',
    'authorized_id': 'هوية المفوض',
    'authorization': 'التفويض الرسمي',
    'founding_contract': 'عقد التأسيس',
    'chamber_certificate': 'شهادة الغرفة التجارية',
    'other': 'أخرى'
  };
  return types[typeId] || typeId;
}