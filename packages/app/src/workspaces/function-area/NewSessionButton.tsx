import { trpc } from '../../lib/trpc';
import { useAppState } from '../../store/context';

export function NewSessionButton() {
  const { dispatch } = useAppState();
  const utils = trpc.useUtils();

  const create = trpc.sessions.create.useMutation({
    onSuccess: (session) => {
      utils.sessions.list.invalidate();
      dispatch({ type: 'SET_ACTIVE_SESSION', sessionId: session.id });
    },
  });

  return (
    <button
      onClick={() => create.mutate({})}
      disabled={create.isPending}
      className="flex w-full items-center gap-2 rounded px-3 py-2 text-sm text-neutral-300 hover:bg-neutral-700 disabled:opacity-50"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <line x1="12" x2="12" y1="5" y2="19" />
        <line x1="5" x2="19" y1="12" y2="12" />
      </svg>
      New Session
    </button>
  );
}
