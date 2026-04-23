import { createContext, useContext, useState } from 'react';
import { Electroview } from 'electrobun/view';
import type { RPCType } from '../../shared/ipc-types.js';

const electroviewContext = createContext<ElectroviewContextValues | null>(null);

type ElectroviewContextValues = {
  electroview: Electroview<ReturnType<typeof Electroview.defineRPC<RPCType>>>;
};

export function useElectroview() {
  const values = useContext(electroviewContext);
  if (!values) {
    throw new Error('useElectroview must be used within an ElectroViewProvider');
  }
  return values.electroview;
}

export function ElectroViewProvider({ children }: { children: React.ReactNode }) {

  const [electroview] = useState(() => {
    return new Electroview({
      rpc: Electroview.defineRPC<RPCType>({
        handlers: {
          requests: {},
          messages: {},
        },
      })
    });
  });

  const contextValue: ElectroviewContextValues = {
    electroview
  };

  return <electroviewContext.Provider value={contextValue}>{children}</electroviewContext.Provider>;
}