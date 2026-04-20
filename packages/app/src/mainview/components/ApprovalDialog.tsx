import type { PermissionRequest } from '../types/session';

interface ApprovalDialogProps {
  approval: PermissionRequest | null;
  onApprove: (requestId: string) => Promise<void> | void;
  onReject: (requestId: string) => Promise<void> | void;
}

export function ApprovalDialog({ approval, onApprove, onReject }: ApprovalDialogProps) {
  if (!approval) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-2xl rounded-xl bg-white p-5 shadow-xl">
        <h3 className="mb-3 text-base font-semibold text-gray-900">本地操作授权请求</h3>
        <dl className="space-y-2 text-sm text-gray-700">
          <div>
            <dt className="font-medium">请求 ID</dt>
            <dd className="break-all">{approval.requestId}</dd>
          </div>
          <div>
            <dt className="font-medium">操作类型</dt>
            <dd>{approval.operation}</dd>
          </div>
          <div>
            <dt className="font-medium">参数</dt>
            <dd>
              <pre className="max-h-56 overflow-auto rounded-md bg-gray-100 p-2 text-xs">
                {JSON.stringify(approval.params, null, 2)}
              </pre>
            </dd>
          </div>
        </dl>

        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
            onClick={() => onReject(approval.requestId)}
          >
            拒绝
          </button>
          <button
            type="button"
            className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm text-white hover:bg-indigo-500"
            onClick={() => onApprove(approval.requestId)}
          >
            批准
          </button>
        </div>
      </div>
    </div>
  );
}
