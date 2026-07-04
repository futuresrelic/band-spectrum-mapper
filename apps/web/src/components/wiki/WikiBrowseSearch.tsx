// Shared search box for the Wiki browse-by-type pages (/wiki/bands,
// /wiki/albums, /wiki/songs, /wiki/artists). Filtering happens client-side
// against an already-fetched list — the same "fetch once, filter locally"
// convention used elsewhere in the Wiki/admin pages, appropriate at this
// catalog's scale.

interface Props {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  resultCount: number;
  totalCount: number;
  noun: string; // e.g. "bands", "albums"
}

export default function WikiBrowseSearch({ value, onChange, placeholder, resultCount, totalCount, noun }: Props) {
  return (
    <div className="mb-6">
      <div className="relative">
        <div className="pointer-events-none absolute inset-y-0 left-4 flex items-center">
          <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
          </svg>
        </div>
        <input
          type="search"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full bg-gray-900 border border-gray-700 rounded-lg pl-10 pr-4 py-2.5 text-sm text-gray-100 placeholder:text-gray-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors"
        />
      </div>
      <p className="text-xs text-gray-600 mt-2">
        {value.trim()
          ? `${resultCount.toLocaleString()} of ${totalCount.toLocaleString()} ${noun}`
          : `${totalCount.toLocaleString()} ${noun}`}
      </p>
    </div>
  );
}
