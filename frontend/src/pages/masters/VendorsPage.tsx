import { CrudPage, StatusBadge } from '@/components/CrudPage';
import { vendorApi } from '@/services/resources';
import type { Vendor } from '@/types';

export default function VendorsPage() {
  return (
    <CrudPage<Vendor>
      title="Vendors"
      subtitle="Manpower supply vendor master"
      breadcrumbs={['Masters', 'Vendors']}
      queryKey="vendors"
      api={vendorApi}
      searchPlaceholder="Search vendor name or code..."
      columns={[
        { key: 'vendorCode', header: 'Code' },
        { key: 'vendorName', header: 'Vendor Name' },
        { key: 'contactPerson', header: 'Contact' },
        { key: 'mobileNumber', header: 'Mobile' },
        { key: 'gstNumber', header: 'GST' },
        { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
      ]}
      fields={[
        { name: 'vendorCode', label: 'Vendor Code', required: true, placeholder: 'V19' },
        { name: 'vendorName', label: 'Vendor Name', required: true },
        { name: 'contactPerson', label: 'Contact Person' },
        { name: 'mobileNumber', label: 'Mobile Number' },
        { name: 'gstNumber', label: 'GST Number' },
        { name: 'status', label: 'Status', type: 'status' },
      ]}
      toFormValues={(r) => ({
        vendorCode: r.vendorCode, vendorName: r.vendorName, contactPerson: r.contactPerson ?? '',
        mobileNumber: r.mobileNumber ?? '', gstNumber: r.gstNumber ?? '', status: r.status,
      })}
    />
  );
}
