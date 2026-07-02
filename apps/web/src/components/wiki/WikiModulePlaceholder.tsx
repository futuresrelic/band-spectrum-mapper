// Empty-state tile for wiki modules that exist in the design but have no data yet.
// Communicates intent without feeling broken.

interface Props {
  icon: string;
  title: string;
  description: string;
  comingSoon?: boolean;
}

export default function WikiModulePlaceholder({ icon, title, description, comingSoon = false }: Props) {
  return (
    <div className="border border-dashed border-gray-800 rounded-lg p-5 flex flex-col items-start gap-2">
      <div className="text-2xl leading-none">{icon}</div>
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-semibold text-gray-300">{title}</h3>
        {comingSoon && (
          <span className="text-[10px] font-medium uppercase tracking-widest text-gray-600 border border-gray-700 rounded px-1.5 py-0.5">
            Soon
          </span>
        )}
      </div>
      <p className="text-xs text-gray-500 leading-relaxed">{description}</p>
    </div>
  );
}
