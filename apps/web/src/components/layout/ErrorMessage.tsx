interface Props {
  error: unknown;
}

export default function ErrorMessage({ error }: Props) {
  const message =
    error instanceof Error ? error.message : 'An unexpected error occurred';
  return (
    <div className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
      {message}
    </div>
  );
}
