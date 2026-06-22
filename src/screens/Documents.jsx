import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { useFeedback } from '../context/FeedbackContext';
import DocumentStatsCards from '../components/DocumentStatsCards';
import DocumentTable from '../components/DocumentTable';
import DocumentFormModal from '../components/DocumentFormModal';
import DocumentDetailsModal from '../components/DocumentDetailsModal';
import EmptyState from '../components/EmptyState';
import { 
  FileText, 
  Plus, 
  Upload,
  Download,
  Printer,
  Filter,
  X
} from 'lucide-react';

export default function Documents() {
  const { user, profile } = useAuth();
  const { data, deleteCompanyDocument } = useData();
  const { success, error } = useFeedback();
  
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingDoc, setEditingDoc] = useState(null);
  const [viewingDoc, setViewingDoc] = useState(null);
  const [activeFilter, setActiveFilter] = useState('all');
  const [showFilters, setShowFilters] = useState(false);

  const documents = data.companyDocuments || [];

  const getRoles = () => {
    if (!profile) return [];
    if (Array.isArray(profile.roles)) return profile.roles;
    if (typeof profile.roles === 'string' && profile.roles.startsWith('[')) {
      try { return JSON.parse(profile.roles); } catch { return []; }
    }
    return [];
  };

  const isAdmin = profile?.role === 'admin' || profile?.role === 'director' || getRoles().includes('admin');

  const getFilteredDocuments = () => {
    if (activeFilter === 'all') return documents;
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    switch (activeFilter) {
      case 'active':
        return documents.filter(doc => {
          if (!doc.expiry_date || doc.status === 'missing_data') return false;
          const expiry = new Date(doc.expiry_date);
          return expiry >= today;
        });
      case 'expired':
        return documents.filter(doc => {
          if (!doc.expiry_date) return false;
          const expiry = new Date(doc.expiry_date);
          return expiry < today;
        });
      case 'expiring_soon':
        return documents.filter(doc => {
          if (!doc.expiry_date || doc.status === 'expired') return false;
          const expiry = new Date(doc.expiry_date);
          const daysUntil = Math.ceil((expiry - today) / (1000 * 60 * 60 * 24));
          return daysUntil > 0 && daysUntil <= 30;
        });
      case 'missing_data':
        return documents.filter(doc => !doc.expiry_date || doc.status === 'missing_data');
      case 'pending_review':
        return documents.filter(doc => doc.status === 'pending_review');
      default:
        return documents;
    }
  };

  const handleDelete = async (doc) => {
    if (!isAdmin) {
      error('ليس لديك صلاحية حذف المستندات');
      return;
    }
    
    const result = await deleteCompanyDocument(doc.id);
    if (result.success) {
      success('تم حذف المستند بنجاح');
    } else {
      error('تعذر حذف المستند');
    }
  };

  const handleExportExcel = () => {
    const filteredDocs = getFilteredDocuments();
    if (filteredDocs.length === 0) {
      error('لا توجد بيانات للتصدير');
      return;
    }

    const headers = ['نوع المستند', 'الاسم', 'رقم الوثيقة', 'المنشأة', 'الجهة المصدرة', 'تاريخ الإصدار', 'تاريخ الانتهاء', 'الحالة'];
    const csvContent = [
      headers.join(','),
      ...filteredDocs.map(doc => [
        getDocumentTypeLabel(doc.document_type),
        doc.document_name || '',
        doc.document_number || '',
        doc.company_name || '',
        doc.issuer || '',
        doc.issue_date || '',
        doc.expiry_date || '',
        getStatusLabel(doc.status)
      ].join(','))
    ].join('\n');

    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `company_documents_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    success('تم تصدير البيانات بنجاح');
  };

  const handlePrint = () => {
    const filteredDocs = getFilteredDocuments();
    if (filteredDocs.length === 0) {
      error('لا توجد بيانات للطباعة');
      return;
    }

    const printContent = `
      <!DOCTYPE html>
      <html dir="rtl">
      <head>
        <title>المستندات والوثائق الرسمية</title>
        <style>
          body { font-family: 'Tajawal', sans-serif; padding: 30px; }
          h1 { color: #059669; text-align: center; margin-bottom: 30px; }
          table { width: 100%; border-collapse: collapse; font-size: 12px; }
          th { background: #059669; color: white; padding: 10px; text-align: right; }
          td { padding: 8px; border: 1px solid #e2e8f0; }
          tr:nth-child(even) { background: #f8fafc; }
          .footer { margin-top: 30px; text-align: center; font-size: 10px; color: #64748b; }
        </style>
      </head>
      <body>
        <h1>المستندات والوثائق الرسمية - شركة عزم للخدمات اللوجستية</h1>
        <table>
          <thead>
            <tr>
              <th>نوع المستند</th>
              <th>الاسم</th>
              <th>رقم الوثيقة</th>
              <th>المنشأة</th>
              <th>تاريخ الإصدار</th>
              <th>تاريخ الانتهاء</th>
              <th>الحالة</th>
            </tr>
          </thead>
          <tbody>
            ${filteredDocs.map(doc => `
              <tr>
                <td>${getDocumentTypeLabel(doc.document_type)}</td>
                <td>${doc.document_name || '-'}</td>
                <td>${doc.document_number || '-'}</td>
                <td>${doc.company_name || '-'}</td>
                <td>${doc.issue_date ? new Date(doc.issue_date).toLocaleDateString('ar-SA') : '-'}</td>
                <td>${doc.expiry_date ? new Date(doc.expiry_date).toLocaleDateString('ar-SA') : '-'}</td>
                <td>${getStatusLabel(doc.status)}</td>
              </tr>
            `).join('')}
          </tbody>
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
    setTimeout(() => printWindow.print(), 250);
  };

  const filters = [
    { id: 'all', label: 'الكل', count: documents.length },
    { id: 'active', label: 'ساري', count: documents.filter(d => {
      const today = new Date(); today.setHours(0,0,0,0);
      return d.expiry_date && new Date(d.expiry_date) >= today && d.status !== 'missing_data';
    }).length },
    { id: 'expiring_soon', label: 'قريب الانتهاء', count: documents.filter(d => {
      if (!d.expiry_date || d.status === 'expired') return false;
      const today = new Date(); today.setHours(0,0,0,0);
      const expiry = new Date(d.expiry_date);
      const days = Math.ceil((expiry - today) / (1000 * 60 * 60 * 24));
      return days > 0 && days <= 30;
    }).length },
    { id: 'expired', label: 'منتهي', count: documents.filter(d => {
      if (!d.expiry_date) return false;
      const today = new Date(); today.setHours(0,0,0,0);
      return new Date(d.expiry_date) < today;
    }).length },
    { id: 'missing_data', label: 'ناقص بيانات', count: documents.filter(d => !d.expiry_date || d.status === 'missing_data').length }
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 bg-gradient-to-br from-blue-600 to-blue-500 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-500/20">
            <FileText className="w-7 h-7 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">المستندات والوثائق الرسمية</h1>
            <p className="text-slate-500 dark:text-slate-400">أرشيف مركزي لوثائق شركة عزم</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setShowAddModal(true)}
            className="btn-primary flex items-center gap-2 shadow-lg shadow-blue-500/20"
          >
            <Plus className="w-5 h-5" />
            إضافة مستند
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <DocumentStatsCards documents={documents} />

      {/* Filters and Actions */}
      <div className="card">
        <div className="flex items-center justify-between flex-wrap gap-4 mb-4">
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl font-medium transition-all ${
                showFilters ? 'bg-blue-500 text-white' : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
              }`}
            >
              <Filter className="w-4 h-4" />
              فلترة
            </button>
            
            {documents.length > 0 && (
              <>
                <button
                  onClick={handleExportExcel}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl font-medium bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 hover:bg-green-100 dark:hover:bg-green-900/30 transition-all"
                >
                  <Download className="w-4 h-4" />
                  تصدير Excel
                </button>
                <button
                  onClick={handlePrint}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl font-medium bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600 transition-all"
                >
                  <Printer className="w-4 h-4" />
                  طباعة / PDF
                </button>
              </>
            )}
          </div>
          
          <div className="text-sm text-slate-500">
            {getFilteredDocuments().length} مستند
          </div>
        </div>

        {/* Filter Tabs */}
        <div className="flex gap-2 flex-wrap">
          {filters.map(filter => (
            <button
              key={filter.id}
              onClick={() => setActiveFilter(filter.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl font-medium transition-all ${
                activeFilter === filter.id
                  ? 'bg-blue-500 text-white shadow-lg'
                  : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'
              }`}
            >
              {filter.label}
              <span className={`px-2 py-0.5 rounded-full text-xs ${
                activeFilter === filter.id ? 'bg-white/20' : 'bg-slate-200 dark:bg-slate-600'
              }`}>
                {filter.count}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Documents Table or Empty State */}
      {documents.length > 0 ? (
        <div className="card overflow-hidden">
          <DocumentTable 
            documents={getFilteredDocuments()}
            onView={setViewingDoc}
            onEdit={setEditingDoc}
            onDelete={handleDelete}
            isAdmin={isAdmin}
          />
        </div>
      ) : (
        <div className="card">
          <EmptyState
            icon={FileText}
            title="لا توجد مستندات رسمية بعد"
            description="ابدأ بإضافة السجل التجاري أو شهادة التوطين أو أي مستند رسمي آخر"
            action={() => setShowAddModal(true)}
            actionLabel="إضافة أول مستند"
            color="#0369A1"
          />
        </div>
      )}

      {/* Old documents section for backward compatibility */}
      {data.documents && data.documents.length > 0 && (
        <div className="card">
          <h3 className="section-title text-slate-600 dark:text-slate-400">ملاحظة</h3>
          <p className="text-sm text-slate-500">
            يوجد {data.documents.length} مستند في النظام القديم. يرجى إعادة إضافتها في القسم الجديد.
          </p>
        </div>
      )}

      {/* Add/Edit Modal */}
      {showAddModal && (
        <DocumentFormModal
          document={null}
          onClose={() => setShowAddModal(false)}
          onSuccess={() => {
            setShowAddModal(false);
            success('تم حفظ المستند بنجاح');
          }}
        />
      )}

      {editingDoc && (
        <DocumentFormModal
          document={editingDoc}
          onClose={() => setEditingDoc(null)}
          onSuccess={() => {
            setEditingDoc(null);
            success('تم تحديث المستند بنجاح');
          }}
        />
      )}

      {viewingDoc && (
        <DocumentDetailsModal
          document={viewingDoc}
          onClose={() => setViewingDoc(null)}
          onEdit={() => setEditingDoc(viewingDoc)}
        />
      )}
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

function getStatusLabel(status) {
  const labels = {
    'active': 'ساري',
    'expired': 'منتهي',
    'expiring_soon': 'قريب الانتهاء',
    'missing_data': 'ناقص بيانات',
    'pending_review': 'بانتظار المراجعة'
  };
  return labels[status] || status || '-';
}