import { Messages } from './Messages';
import { InstructionInput } from './InstructionInput';

export function Workspace() {
  return (
    <div className="flex-1 flex flex-col h-full relative overflow-hidden">
      <Messages />
      <InstructionInput />
    </div>
  );
}
