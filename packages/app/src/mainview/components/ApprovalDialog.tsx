import type { PendingApproval } from '../types/domain';

interface ApprovalDialogProps {
  pendingApproval: PendingApproval | null;
  onApprove: (requestId: string) => Promise<void>;
  onReject: (requestId: string) => Promise<void>;
}

export function ApprovalDialog({ pendingApproval, onApprove, onReject }: ApprovalDialogProps) {
  if (!pendingApproval) {
    return null;
  }

  return (
    <div className='approval-dialog-backdrop'>
      <div className='approval-dialog'>
        <h3>本地操作授权请求</h3>
        <p>操作类型：{pendingApproval.operation}</p>
        <pre>{JSON.stringify(pendingApproval.params, null, 2)}</pre>
        <div className='approval-dialog-actions'>
          <button type='button' className='is-danger' onClick={() => void onReject(pendingApproval.requestId)}>
            拒绝
          </button>
          <button type='button' className='is-primary' onClick={() => void onApprove(pendingApproval.requestId)}>
            批准
          </button>
        </div>
      </div>
    </div>
  );
}
