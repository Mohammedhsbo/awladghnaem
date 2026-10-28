import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Bike, Plus, RefreshCw, Search } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { getUser, pos } from '../api';

type Lang = 'en' | 'ar';

export default function Inventory({ lang, branchId }: { lang: Lang; branchId?: string }) {
  const isRtl = lang === 'ar';
  const navigate = useNavigate();
  const canManage = getUser()?.role.name === 'super_admin';
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  
  const list = useQuery({ 
    queryKey: ['desktop-inventory', query, branchId, page], 
    queryFn: () => pos.listInventoryMotorcycles(query || undefined, branchId, 50, page), 
    enabled: query.length === 0 || query.length >= 2 
  });
  
  const data = list.data?.items ?? [];
  const total = list.data?.total ?? 0;
  const totalPages = list.data?.totalPages ?? 1;
  const money = (value: number) => `${value.toLocaleString(isRtl ? 'ar-EG' : 'en-EG', { maximumFractionDigits: 0 })} ${isRtl ? 'ج.م' : 'EGP'}`;
  
  return (
    <section className="desktop-page" dir={isRtl ? 'rtl' : 'ltr'}>
      <div className="page-heading">
        <div>
          <span className="eyebrow">{isRtl ? 'المخزون الحي' : 'Live inventory'}</span>
          <h1>{isRtl ? 'المخزون' : 'Inventory'}</h1>
          <p>{isRtl ? 'الوحدات المتاحة في نطاق الفرع الحالي.' : 'Available units within the current branch scope.'}</p>
        </div>
        <div className="report-controls">
          <button className="secondary-action" onClick={() => list.refetch()}>
            <RefreshCw size={16} /> {isRtl ? 'تحديث' : 'Refresh'}
          </button>
          {canManage && (
            <button className="primary-action" onClick={() => navigate('/inventory/new')}>
              <Plus size={16} /> {isRtl ? 'إضافة وحدات' : 'Add units'}
            </button>
          )}
        </div>
      </div>
      
      <div className="toolbar">
        <div className="search-box">
          <Search size={17} />
          <input value={query} onChange={event => { setQuery(event.target.value); setPage(1); }} placeholder={isRtl ? 'ابحث بالموديل أو رقم الموتور...' : 'Search model or motor number...'} />
        </div>
        <span className="result-count">{total} {isRtl ? 'وحدة متاحة' : 'available units'}</span>
      </div>
      
      {list.isLoading && (
        <div className="inventory-grid">
          {[1, 2, 3, 4].map(item => <div className="inventory-card skeleton" key={item} />)}
        </div>
      )}
      
      {list.isError && (
        <div className="state-panel">{isRtl ? 'تعذر تحميل المخزون.' : 'Could not load inventory.'}</div>
      )}
      
      {!list.isLoading && !list.isError && data.length === 0 && (
        <div className="state-panel">{isRtl ? 'لا توجد وحدات متاحة.' : 'No available units found.'}</div>
      )}
      
      {!list.isLoading && !list.isError && (
        <div className="inventory-grid">
          {data.map(item => (
            <button 
              className="inventory-card" 
              key={item.id}
              onClick={() => navigate(`/inventory/${item.id}`)}
              style={{ textAlign: 'start', cursor: 'pointer', padding: 0, width: '100%' }}
            >
              <div className="inventory-image">
                {item.images?.[0] ? <img src={item.images[0]} alt="" /> : <Bike size={38} />}
              </div>
              <div className="inventory-info">
                <span className="inventory-brand">{isRtl ? item.brand?.nameAr ?? '' : item.brand?.nameEn ?? ''}</span>
                <h2>{item.model}</h2>
                <p>{item.year} · {item.color || (isRtl ? 'بدون لون' : 'No color')}</p>
                <p>{isRtl ? 'نوع الوقود' : 'Fuel type'}: {item.fuelType === 'PETROL' ? (isRtl ? 'بنزين' : 'Petrol') : item.fuelType === 'ELECTRIC' ? (isRtl ? 'كهرباء' : 'Electric') : (isRtl ? 'غير معروف' : 'Unknown')}</p>
                <p>{isRtl ? 'سعر التكلفة' : 'Cost price'}: {item.costPrice != null ? money(item.costPrice) : (isRtl ? 'غير متوفر' : 'N/A')}</p>
                <code title={item.vin} style={{ color: 'var(--blue)' }}>{item.vin}</code>
                <div className="inventory-footer">
                  <strong>{money(item.price)}</strong>
                  <span className="status-pill">{item.status}</span>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className="report-controls" style={{ justifyContent: 'center', marginTop: '1.5rem' }}>
          <button className="secondary-action" disabled={page <= 1 || list.isFetching} onClick={() => setPage(current => current - 1)}>
            {isRtl ? 'السابق' : 'Previous'}
          </button>
          <span className="result-count">{page} / {totalPages}</span>
          <button className="secondary-action" disabled={page >= totalPages || list.isFetching} onClick={() => setPage(current => current + 1)}>
            {isRtl ? 'التالي' : 'Next'}
          </button>
        </div>
      )}

    </section>
  );
}
