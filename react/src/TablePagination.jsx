import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import Dropdown from "./Dropdown";

export function usePagination(items, initialSize = 10) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(initialSize);
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const safePage = Math.min(page, totalPages);
  return {
    rows: items.slice((safePage - 1) * pageSize, safePage * pageSize),
    page: safePage,
    pageSize,
    totalPages,
    total: items.length,
    setPage,
    setPageSize: (size) => {
      setPageSize(size);
      setPage(1);
    },
    reset: () => setPage(1),
  };
}

export function pageItems(page, totalPages) {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, index) => index + 1);
  const start = Math.max(2, Math.min(page - 1, totalPages - 4));
  const end = Math.min(totalPages - 1, Math.max(page + 1, 5));
  const middle = Array.from({ length: end - start + 1 }, (_, index) => start + index);
  return [1, ...(start > 2 ? ["start-gap"] : []), ...middle, ...(end < totalPages - 1 ? ["end-gap"] : []), totalPages];
}

export function PageButtons({ page, totalPages, onPage }) {
  return pageItems(page, totalPages).map((item) =>
    typeof item === "number" ? (
      <button key={item} className={page === item ? "active" : ""} onClick={() => onPage(item)}>{item}</button>
    ) : (
      <span key={item} className="page-gap">…</span>
    ),
  );
}

export function PageSize({ value, sizes = [10, 20, 50], onChange }) {
  return (
    <span className="page-size">
      Số dòng
      <Dropdown label="Số dòng" placement="top" align="right" searchable={false} value={value} onChange={(next) => onChange(Number(next))} options={sizes.map((size) => ({ value: size, label: String(size) }))} />
    </span>
  );
}

export default function TablePagination({ pager, noun, sizes = [10, 20, 50], showRange = true }) {
  const { page, pageSize, totalPages, total, setPage, setPageSize } = pager;
  if (!total) return null;
  return (
    <div className="pagination">
      {showRange && (
        <span>
          Hiển thị <b>{(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)}</b> trong {total} {noun}
        </span>
      )}
      <div>
        <PageSize value={pageSize} sizes={sizes} onChange={setPageSize} />
        <button disabled={page === 1} onClick={() => setPage(page - 1)} aria-label="Trang trước"><ChevronLeft size={16} /></button>
        <PageButtons page={page} totalPages={totalPages} onPage={setPage} />
        <button disabled={page === totalPages} onClick={() => setPage(page + 1)} aria-label="Trang sau"><ChevronRight size={16} /></button>
      </div>
    </div>
  );
}
