import { Eye, Edit3, Download, Share2, Trash2, FileText } from 'lucide-react';
import DocumentStatusBadge, { getDocumentStatus } from './DocumentStatusBadge';

export default function DocumentTable({ documents, onView, onEdit, onDelete, isAdmin }) {
  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  if (!documents || documents.length === 0) {
    return null;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="bg-slate-50 dark:bg-slate-800/50">
            <th className="px-4 py-3 text-right text-sm font-semibold text-slate-600 dark:text-slate-300">نوع المستند</th>
            <th className="px-4 py-3 text-right text-sm font-semibold text-slate-600 dark:text-slate-300">الاسم</th>
            <th className="px-4 py-3 text-right text-sm font-semibold text-slate-600 dark:text-slate-300">رقم الوثيقة</th>
            <th className="px-4 py-3 text-right text-sm font-semibold text-slate-600 dark:text-slate-300">المنشأة</th>
            <th className="px-4 py-3 text-right text-sm font-semibold text-slate-600 dark:text-slate-300">تاريخ الإصدار</th>
            <th className="px-4 py-3 text-right text-sm font-semibold text-slate-600 dark:text-slate-300">تاريخ الانتهاء</th>
            <th className="px-4 py-3 text-right text-sm font-semibold text-slate-600 dark:text-slate-300">الحالة</th>
            <th className="px-4 py-3 text-right text-sm font-semibold text-slate-600 dark:text-slate-300">المرفق</th>
            <th className="px-4 py-3 text-center text-sm font-semibold text-slate-600 dark:text-slate-300">الإجراءات</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
          {documents.map((doc) => {
            const computedStatus = getDocumentStatus(
              doc.expiry_date,
              !!doc.file_url,
              !!doc.document_name
            );
            
            return (
              <tr 
                key={doc.id} 
                className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
              >
                <td className="px-4 py-3">
                  <span className="text-sm text-slate-600 dark:text-slate-400">
                    {getDocumentTypeLabel(doc.document_type)}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center">
                      <FileText className="w-4 h-4 text-blue-500" />
                    </div>
                    <span className="font-medium text-slate-800 dark:text-slate-100">
                      {doc.document_name || getDocumentTypeLabel(doc.document_type)}
                    </span>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <span className="text-sm text-slate-600 dark:text-slate-400">
                    {doc.document_number || '-'}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className="text-sm text-slate-600 dark:text-slate-400">
                    {doc.company_name || '-'}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className="text-sm text-slate-500">
                    {formatDate(doc.issue_date)}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className={`text-sm ${
                    computedStatus === 'expired' ? 'text-red-500 font-medium' :
                    computedStatus === 'expiring_soon' ? 'text-orange-500 font-medium' :
                    'text-slate-500'
                  }`}>
                    {formatDate(doc.expiry_date)}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <DocumentStatusBadge status={computedStatus} />
                </td>
                <td className="px-4 py-3">
                  {doc.file_url ? (
                    <span className="inline-flex items-center gap-1 text-xs text-green-600 bg-green-50 dark:bg-green-900/20 px-2 py-1 rounded-full">
                      <FileText className="w-3 h-3" />
                      مرفق
                    </span>
                  ) : (
                    <span className="text-xs text-slate-400">لا يوجد</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-center gap-1">
                    <button
                      onClick={() => onView?.(doc)}
                      className="w-8 h-8 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center justify-center transition-colors"
                      title="عرض"
                    >
                      <Eye className="w-4 h-4 text-slate-500" />
                    </button>
                    {onEdit && (
                      <button
                        onClick={() => onEdit?.(doc)}
                        className="w-8 h-8 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center justify-center transition-colors"
                        title="تعديل"
                      >
                        <Edit3 className="w-4 h-4 text-blue-500" />
                      </button>
                    )}
                    {doc.file_url && (
                      <a
                        href={doc.file_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="w-8 h-8 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center justify-center transition-colors"
                        title="تحميل"
                      >
                        <Download className="w-4 h-4 text-emerald-500" />
                      </a>
                    )}
                    {onDelete && isAdmin && (
                      <button
                        onClick={() => onDelete?.(doc)}
                        className="w-8 h-8 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center justify-center transition-colors"
                        title="حذف"
                      >
                        <Trash2 className="w-4 h-4 text-red-500" />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
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
  return types[typeId] || typeId || 'غير محدد';
}