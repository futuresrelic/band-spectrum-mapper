interface Props {
  message: string;
  action?: React.ReactNode;
}

export default function EmptyState({ message, action }: Props) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <p className="text-surface-700 text-sm">{message}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
