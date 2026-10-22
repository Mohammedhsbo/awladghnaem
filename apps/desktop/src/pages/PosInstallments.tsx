import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { NavLink, useLocation } from 'react-router-dom';
import { Calendar, ChevronDown, ChevronUp, CheckCircle2, Clock, AlertCircle, Search, Plus, Bike, Download } from 'lucide-react';
import {
  posInstallments,
  salesRequests,
  type PosInstallmentPlanRecord,
  type PosInstallment,
} from '../api';
import { useViewingBranch } from '../contexts/ViewingBranchContext';
import { DataTableState } from '../components/DataTable';

type Lang = 'en' | 'ar';

function statusColor(s: PosInstallment['status']) {
  if (s === 'PAID') return 'var(--green)';
  if (s === 'PARTIAL') return '#f59e0b';
  return 'var(--text-3)';
}

function InstallmentStatusIcon({ status }: { status: PosInstallment['status'] }) {
  if (status === 'PAID') return <CheckCircle2 size={15} />;
  if (status === 'PARTIAL') return <AlertCircle size={15} />;
  return <Clock size={15} />;
}

export default function PosInstallments({ lang }: { lang: Lang }) {
  const isRtl = lang === 'ar';
  const qc = useQueryClient();
  const { viewingBranchId } = useViewingBranch();

  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Generate Plan modal state
  const [showGenerate, setShowGenerate] = useState(false);
  const [selectedRequestId, setSelectedRequestId] = useState('');
  const [months, setMonths] = useState('12');
  const [interestRate, setInterestRate] = useState('0');
  const [genError, setGenError] = useState<string | null>(null);
  const [documentError, setDocumentError] = useState<string | null>(null);
  const location = useLocation();

  const plansQuery = useQuery({
    queryKey: ['pos-installments', viewingBranchId, search],
    queryFn: () => posInstallments.list(viewingBranchId ?? undefined, search || undefined),
  });

  const requestsQuery = useQuery({
    queryKey: ['sales-requests', viewingBranchId],
    queryFn: () => salesRequests.list(viewingBranchId ?? undefined),
    enabled: showGenerate,
  });

  const generate = useMutation({
    mutationFn: () =>
      posInstallments.generate({
        saleRequestId: selectedRequestId,
        months: Number(months),
        interestRate: Number(interestRate),
      }),
    onSuccess: () => {
      setShowGenerate(false);
      setSelectedRequestId('');
      setMonths('12');
      setInterestRate('0');
      setGenError(null);
      void qc.invalidateQueries({ queryKey: ['pos-installments'] });
    },
    onError: (err: Error) => setGenError(err.message),
  });

  const money = (v: number) =>
    `${Number(v).toLocaleString(isRtl ? 'ar-EG' : 'en-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${isRtl ? 'ج.م' : 'EGP'}`;

  const plans: PosInstallmentPlanRecord[] = plansQuery.data ?? [];
  const pendingRequests = requestsQuery.data?.filter((r) => r.status === 'PENDING') ?? [];
  const routeNotice = (location.state as { directNotice?: string } | null)?.directNotice;

  async function downloadPlanDocument(planId: string, documentKey: string, filename: string) {
    setDocumentError(null);
    try {
      const file = await posInstallments.downloadDocument(planId, documentKey);
      const objectUrl = URL.createObjectURL(file);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
    } catch (error) {
      setDocumentError(error instanceof Error ? error.message : (isRtl ? 'تعذر تنزيل المستند.' : 'Could not download the document.'));
    }
  }

  const activePlans = plans.filter((plan) => plan.status === 'ACTIVE').length;
  const totalOutstanding = plans.reduce((sum, plan) => sum + plan.remainingBalance, 0);
  const totalCollected = plans.reduce((sum, plan) => sum + plan.paidAmount, 0);
  const overdueCount = plans.reduce(
    (sum, plan) => sum + plan.installments.filter((inst) => inst.status !== 'PAID' && new Date(inst.dueDate) < new Date()).length,
    0,
  );

  return (
    <section className="desktop-page pos-installments-shell" dir={isRtl ? 'rtl' : 'ltr'}>
      <div className="page-heading pos-installments-header">
        <div>
          <span className="eyebrow">{isRtl ? 'إدارة التقسيط' : 'Installment management'}</span>
          <h1>{isRtl ? 'خطط التقسيط' : 'Installment Plans'}</h1>
          <p>{isRtl ? 'عرض ومتابعة خطط التقسيط النشطة.' : 'View and track active installment plans.'}</p>
        </div>
        <div style={{ display: 'flex', gap: '0.65rem', flexWrap: 'wrap' }}>
          <NavLink className="secondary-action" to="/pos-installments/new">
            <Bike size={16} />
            {isRtl ? 'إنشاء خطة تقسيط' : 'Create Installment Plan'}
          </NavLink>
          <button className="primary-action pos-installment-primary" onClick={() => setShowGenerate(true)}>
            <Plus size={16} />
            {isRtl ? 'إنشاء خطة من طلب' : 'Generate from Request'}
          </button>
        </div>
      </div>

      {routeNotice && <div className="state-panel" role="status" style={{ marginBottom: '1rem', color: 'var(--green)' }}>{routeNotice}</div>}
      {documentError && <div className="state-panel" role="alert" style={{ marginBottom: '1rem' }}>{documentError}</div>}

      <div className="pos-installment-summary-grid">
        <div className="surface-panel pos-summary-card">
          <span className="eyebrow">{isRtl ? 'الخطط النشطة' : 'Active plans'}</span>
          <strong>{activePlans}</strong>
          <small>{isRtl ? 'خطة قيد التنفيذ' : 'plans in progress'}</small>
        </div>
        <div className="surface-panel pos-summary-card accent-card">
          <span className="eyebrow">{isRtl ? 'المجموع المدفوع' : 'Collected'}</span>
          <strong>{money(totalCollected)}</strong>
          <small>{isRtl ? 'من إجمالي المبيعات' : 'across all plans'}</small>
        </div>
        <div className="surface-panel pos-summary-card danger-card">
          <span className="eyebrow">{isRtl ? 'المتبقي' : 'Outstanding'}</span>
          <strong>{money(totalOutstanding)}</strong>
          <small>{overdueCount} {isRtl ? 'متأخر' : 'overdue'}</small>
        </div>
      </div>

      {showGenerate && (
        <div
          className="pos-plan-modal-backdrop"
          onClick={(e) => { if (e.target === e.currentTarget) setShowGenerate(false); }}
        >
          <form
            className="surface-panel pos-plan-modal"
            onSubmit={(e) => { e.preventDefault(); setGenError(null); generate.mutate(); }}
          >
            <div className="pos-plan-modal-header">
              <div>
                <span className="eyebrow">{isRtl ? 'إدارة التقسيط' : 'Installments'}</span>
                <h2>{isRtl ? 'إنشاء خطة تقسيط' : 'Generate Installment Plan'}</h2>
              </div>
              <button type="button" className="icon-btn ghost" onClick={() => setShowGenerate(false)} aria-label="Close">
                ×
              </button>
            </div>

            {genError && <div className="inline-error" role="alert">{genError}</div>}

            <label className="pos-plan-form-label">
              <span>{isRtl ? 'طلب التقسيط *' : 'Installment Request *'}</span>
              <select
                required
                value={selectedRequestId}
                onChange={(e) => setSelectedRequestId(e.target.value)}
              >
                <option value="">{isRtl ? '-- اختر طلباً --' : '-- Select a request --'}</option>
                {pendingRequests.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.customerName} — {r.customerPhone} ({money(r.requestedAmount)})
                  </option>
                ))}
              </select>
            </label>

            <div className="pos-plan-form-grid">
              <label className="pos-plan-form-label">
                <span>{isRtl ? 'عدد الأشهر *' : 'Number of Months *'}</span>
                <input
                  required
                  type="number"
                  min="1"
                  max="120"
                  value={months}
                  onChange={(e) => setMonths(e.target.value)}
                />
              </label>

              <label className="pos-plan-form-label">
                <span>{isRtl ? 'الفائدة السنوية (%)' : 'Annual interest rate (%)'}</span>
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  value={interestRate}
                  onChange={(e) => setInterestRate(e.target.value)}
                />
              </label>
            </div>

            <div className="pos-plan-modal-actions">
              <button className="secondary-action" type="button" onClick={() => setShowGenerate(false)}>
                {isRtl ? 'إلغاء' : 'Cancel'}
              </button>
              <button className="primary-action" type="submit" disabled={generate.isPending}>
                {generate.isPending
                  ? (isRtl ? 'جاري الإنشاء...' : 'Generating...')
                  : (isRtl ? 'إنشاء الخطة' : 'Create Plan')}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="surface-panel pos-installments-toolbar">
        <div className="search-box">
          <Search size={17} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={isRtl ? 'ابحث بالاسم أو رقم الهاتف...' : 'Search by name or phone...'}
          />
        </div>
        <span className="result-count">{plans.length} {isRtl ? 'خطة' : 'plans'}</span>
      </div>

      {plansQuery.isLoading && <DataTableState kind="loading" lang={lang} />}
      {!plansQuery.isLoading && plans.length === 0 && <DataTableState kind="empty" lang={lang} />}

      {!plansQuery.isLoading && plans.length > 0 && (
        <div className="pos-plan-list">
          {plans.map((plan) => {
            const isExpanded = expandedId === plan.id;
            const mcBrand = isRtl
              ? plan.motorcycle?.brand?.nameAr
              : plan.motorcycle?.brand?.nameEn;
            const paidPct = plan.totalAmount
              ? Math.round((plan.paidAmount / plan.totalAmount) * 100)
              : 0;
            const overdue = plan.installments.filter((inst) => inst.status !== 'PAID' && new Date(inst.dueDate) < new Date()).length;

            return (
              <article key={plan.id} className="surface-panel pos-plan-card">
                <div className="pos-plan-card-header" onClick={() => setExpandedId(isExpanded ? null : plan.id)}>
                  <div className="pos-plan-main">
                    <div className="pos-plan-client-row">
                      <h2>{plan.customerName}</h2>
                      <span className={`pos-plan-status pos-plan-status-${plan.status.toLowerCase()}`}>
                        {plan.status}
                      </span>
                    </div>

                    <div className="pos-plan-meta">
                      <span>📞 {plan.customerPhone}</span>
                      {plan.motorcycle && (
                        <span>
                          <Calendar size={13} />
                          {' '}{mcBrand} {plan.motorcycle.model}
                          {' · '}{plan.motorcycle.fuelType === 'PETROL' ? (isRtl ? 'بنزين' : 'Petrol') : plan.motorcycle.fuelType === 'ELECTRIC' ? (isRtl ? 'كهرباء' : 'Electric') : (isRtl ? 'غير معروف' : 'Unknown')}
                        </span>
                      )}
                    </div>
                  </div>

                  <button type="button" className="icon-btn ghost" aria-label={isExpanded ? 'Collapse' : 'Expand'}>
                    {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                  </button>
                </div>

                <div className="pos-plan-metrics">
                  <div>
                    <small>{isRtl ? 'إجمالي' : 'Total'}</small>
                    <strong>{money(plan.totalAmount)}</strong>
                  </div>
                  <div>
                    <small>{isRtl ? 'مدفوع' : 'Paid'}</small>
                    <strong className="positive">{money(plan.paidAmount)}</strong>
                  </div>
                  <div>
                    <small>{isRtl ? 'متبقي' : 'Remaining'}</small>
                    <strong className="danger">{money(plan.remainingBalance)}</strong>
                  </div>
                </div>

                <div className="pos-plan-progress">
                  <div className="pos-plan-progress-track">
                    <span style={{ width: `${paidPct}%` }} />
                  </div>
                  <small>{paidPct}% {isRtl ? 'مسدد' : 'paid'}</small>
                </div>

                {isExpanded && (
                  <div className="pos-plan-schedule-wrap">
                    <div className="pos-plan-meta">
                      <span>{isRtl ? 'رقم الدراجة:' : 'Motorcycle number:'} {plan.motorcycle.vin}</span>
                      <span>{isRtl ? 'السنة:' : 'Year:'} {plan.motorcycle.year}</span>
                      {plan.motorcycle.color && <span>{isRtl ? 'اللون:' : 'Color:'} {plan.motorcycle.color}</span>}
                      {plan.customerEmail && <span>{isRtl ? 'البريد الإلكتروني:' : 'Email:'} {plan.customerEmail}</span>}
                      {plan.buyerAddress && <span>{isRtl ? 'العنوان:' : 'Address:'} {plan.buyerAddress}</span>}
                      {plan.buyerOccupation && <span>{isRtl ? 'المهنة:' : 'Occupation:'} {plan.buyerOccupation}</span>}
                      {plan.buyerOccupationAddress && <span>{isRtl ? 'عنوان العمل:' : 'Occupation address:'} {plan.buyerOccupationAddress}</span>}
                      {plan.documentType && <span>{isRtl ? 'نوع المستند:' : 'Document route:'} {plan.documentType}</span>}
                      {plan.firstGuarantorName && <span>{isRtl ? 'الضامن الأول:' : 'First guarantor:'} {plan.firstGuarantorName}</span>}
                      {plan.firstGuarantorPhone && <span>{isRtl ? 'هاتف الضامن الأول:' : 'First guarantor phone:'} {plan.firstGuarantorPhone}</span>}
                      {plan.firstGuarantorAddress && <span>{isRtl ? 'عنوان الضامن الأول:' : 'First guarantor address:'} {plan.firstGuarantorAddress}</span>}
                      {plan.firstGuarantorOccupation && <span>{isRtl ? 'مهنة الضامن الأول:' : 'First guarantor occupation:'} {plan.firstGuarantorOccupation}</span>}
                      {plan.firstGuarantorOccupationAddress && <span>{isRtl ? 'عنوان عمل الضامن الأول:' : 'First guarantor occupation address:'} {plan.firstGuarantorOccupationAddress}</span>}
                      {plan.secondGuarantorName && <span>{isRtl ? 'الضامن الثاني:' : 'Second guarantor:'} {plan.secondGuarantorName}</span>}
                      {plan.secondGuarantorPhone && <span>{isRtl ? 'هاتف الضامن الثاني:' : 'Second guarantor phone:'} {plan.secondGuarantorPhone}</span>}
                      {plan.secondGuarantorAddress && <span>{isRtl ? 'عنوان الضامن الثاني:' : 'Second guarantor address:'} {plan.secondGuarantorAddress}</span>}
                      {plan.secondGuarantorOccupation && <span>{isRtl ? 'مهنة الضامن الثاني:' : 'Second guarantor occupation:'} {plan.secondGuarantorOccupation}</span>}
                      {plan.secondGuarantorOccupationAddress && <span>{isRtl ? 'عنوان عمل الضامن الثاني:' : 'Second guarantor occupation address:'} {plan.secondGuarantorOccupationAddress}</span>}
                    </div>
                    {plan.annualInterestRate != null && plan.durationMonths != null && (
                      <div className="pos-plan-meta">
                        {plan.financingCompany && (
                          <span>{isRtl ? 'شركة التمويل:' : 'Financing company:'} {plan.financingCompany.name}</span>
                        )}
                        {plan.motorcyclePrice != null && (
                          <span>{isRtl ? 'سعر الدراجة:' : 'Motorcycle price:'} {money(plan.motorcyclePrice)}</span>
                        )}
                        <span>{isRtl ? 'الدفعة المقدمة:' : 'Down payment:'} {money(plan.downPayment ?? 0)}</span>
                        <span>{isRtl ? 'المبلغ المموّل:' : 'Financed amount:'} {money(plan.financedAmount ?? 0)}</span>
                        <span>{isRtl ? 'الفائدة السنوية:' : 'Annual rate:'} {plan.annualInterestRate}%</span>
                        <span>{isRtl ? 'إجمالي الفائدة:' : 'Total interest:'} {money(plan.totalInterest ?? 0)}</span>
                        <span>{isRtl ? 'المدة:' : 'Duration:'} {plan.durationMonths} {isRtl ? 'شهر' : 'months'}</span>
                        {plan.installments[0] && (
                          <span>{isRtl ? 'القسط الشهري المجدول:' : 'Scheduled monthly installment:'} {money(plan.installments[0].amount)}</span>
                        )}
                        {plan.orderId && <span>{isRtl ? 'رقم البيع:' : 'Sale order:'} {plan.orderId}</span>}
                      </div>
                    )}
                    {plan.documents && (
                      <div className="pos-plan-meta">
                        {([
                          ['buyerIdFront', 'buyerIdFront', 'Buyer ID - front', 'بطاقة المشتري - وجه'],
                          ['buyerIdBack', 'buyerIdBack', 'Buyer ID - back', 'بطاقة المشتري - ظهر'],
                          ['supportingDocument', 'supportingDocument', 'Supporting document', 'المستند الداعم'],
                          ['firstGuarantorIdFront', 'firstGuarantorIdFront', 'First guarantor ID - front', 'بطاقة الضامن الأول - وجه'],
                          ['firstGuarantorIdBack', 'firstGuarantorIdBack', 'First guarantor ID - back', 'بطاقة الضامن الأول - ظهر'],
                          ['secondGuarantorIdFront', 'secondGuarantorIdFront', 'Second guarantor ID - front', 'بطاقة الضامن الثاني - وجه'],
                          ['secondGuarantorIdBack', 'secondGuarantorIdBack', 'Second guarantor ID - back', 'بطاقة الضامن الثاني - ظهر'],
                          ['guarantorSignature', 'guarantorSignature', 'Guarantor signature', 'توقيع الضامن'],
                          ['electricityLetter', 'electricityLetter', 'Electricity bill', 'إيصال كهرباء'],
                        ] as const).map(([key, document, en, ar]) => (
                          <span key={key}>
                            {isRtl ? ar : en}: {plan.documents?.[key]
                              ? (isRtl ? 'مرفق' : 'Attached')
                              : (isRtl ? 'غير مرفق' : 'Not attached')}
                            {plan.documents?.[key] && (
                              <button type="button" className="secondary-action" onClick={() => void downloadPlanDocument(plan.id, document, key)}>
                                <Download size={14} /> {isRtl ? 'تنزيل' : 'Download'}
                              </button>
                            )}
                          </span>
                        ))}
                      </div>
                    )}
                    {plan.installments.length === 0 ? (
                      <p className="pos-plan-empty">{isRtl ? 'لا توجد أقساط.' : 'No installments.'}</p>
                    ) : (
                      <div className="pos-plan-schedule-table-wrap">
                        <table className="pos-plan-schedule-table">
                          <thead>
                            <tr>
                              <th>#</th>
                              <th>{isRtl ? 'تاريخ الاستحقاق' : 'Due Date'}</th>
                              <th>{isRtl ? 'المبلغ' : 'Amount'}</th>
                              <th>{isRtl ? 'المدفوع' : 'Paid'}</th>
                              <th>{isRtl ? 'الحالة' : 'Status'}</th>
                            </tr>
                          </thead>
                          <tbody>
                            {plan.installments.map((inst, idx) => {
                              const overdue = inst.status !== 'PAID' && new Date(inst.dueDate) < new Date();
                              return (
                                <tr key={inst.id} className={overdue ? 'pos-plan-overdue' : ''}>
                                  <td>{idx + 1}</td>
                                  <td>
                                    {new Date(inst.dueDate).toLocaleDateString(isRtl ? 'ar-EG' : 'en-GB')}
                                    {overdue && <span className="pos-plan-overdue-label">{isRtl ? 'متأخر' : 'overdue'}</span>}
                                  </td>
                                  <td>{money(inst.amount)}</td>
                                  <td className="positive">{money(inst.paidAmount)}</td>
                                  <td>
                                    <span className="pos-installment-status" style={{ color: statusColor(inst.status) }}>
                                      <InstallmentStatusIcon status={inst.status} />
                                      {inst.status}
                                    </span>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}

                    {overdue > 0 && (
                      <div className="pos-plan-warning">
                        <AlertCircle size={14} />
                        {isRtl ? `${overdue} أقساط مستحقة الآن.` : `${overdue} installments are due now.`}
                      </div>
                    )}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
