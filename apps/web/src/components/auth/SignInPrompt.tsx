import { useAuth } from '../../contexts/AuthContext';

interface Props {
  message?: string;
}

export default function SignInPrompt({ message = 'Sign in to see your personal ratings.' }: Props) {
  const { login } = useAuth();
  return (
    <div className="rounded-lg border border-surface-200 bg-surface-50 px-6 py-5 text-center">
      <p className="text-sm text-surface-700 mb-3">{message}</p>
      <button className="btn-primary" onClick={login}>
        Sign in with Google
      </button>
    </div>
  );
}
