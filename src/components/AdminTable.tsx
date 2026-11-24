import { useEffect, useState, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useI18n } from '../i18n';
import { Button } from './ui';

export interface AdminColumn<T> {
  key: string;
  label: string;
  render: (row: T) => ReactNode;
  align?: 'start' | 'end';
}

export function AdminTable<T>({ rows, columns, rowKey, emptyText, resetKey, pageSize = 8 }: {
  rows: T[];
  columns: Array<AdminColumn<T>>;
  rowKey: (row: T) => string;
  emptyText: string;
  resetKey?: string;
  pageSize?: number;
}) {
  const { t } = useI18n();
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const visible = rows.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  useEffect(() => setPage(1), [resetKey]);

  if (rows.length === 0) return <div className="admin-table-empty">{emptyText}</div>;

  return (
    <div className="admin-table-block">
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>{columns.map((column) => <th key={column.key} className={column.align === 'end' ? 'end' : ''}>{column.label}</th>)}</tr>
          </thead>
          <tbody>
            {visible.map((row) => (
              <tr key={rowKey(row)}>
                {columns.map((column) => (
                  <td key={column.key} data-label={column.label} className={column.align === 'end' ? 'end' : ''}>{column.render(row)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="admin-pagination">
        <span className="tiny muted">{t('admin.showing', { from: (currentPage - 1) * pageSize + 1, to: Math.min(currentPage * pageSize, rows.length), total: rows.length })}</span>
        <div className="row gap-6">
          <Button size="sm" variant="outline" disabled={currentPage === 1} onClick={() => setPage((value) => value - 1)}><ChevronLeft size={15} />{t('common.previous')}</Button>
          <span className="tiny bold">{currentPage} / {totalPages}</span>
          <Button size="sm" variant="outline" disabled={currentPage === totalPages} onClick={() => setPage((value) => value + 1)}>{t('common.next')}<ChevronRight size={15} /></Button>
        </div>
      </div>
    </div>
  );
}
