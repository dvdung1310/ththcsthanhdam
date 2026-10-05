import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

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

export default function TablePagination({ pager, noun, sizes = [10, 20, 50] }) {
  const { page, pageSize, totalPages, total, setPage, setPageSize } = pager;
  if (!total) return null;
  return (
    <div className="pagination">
      <span>
        Hiển thị <b>{(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)}</b> trong {total} {noun}
      </span>
      <div>
        <label>
          Số dòng{" "}
          <select value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))}>
            {sizes.map((size) => <option key={size}>{size}</option>)}
          </select>
        </label>
        <button disabled={page === 1} onClick={() => setPage(page - 1)} aria-label="Trang trước"><ChevronLeft size={16} /></button>
        {Array.from({ length: totalPages }, (_, index) => (
          <button key={index} className={page === index + 1 ? "active" : ""} onClick={() => setPage(index + 1)}>{index + 1}</button>
        ))}
        <button disabled={page === totalPages} onClick={() => setPage(page + 1)} aria-label="Trang sau"><ChevronRight size={16} /></button>
      </div>
    </div>
  );
}
