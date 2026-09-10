"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

interface MenuContextType {
  menuAberto: boolean;
  abrirMenu: () => void;
  fecharMenu: () => void;
}

const MenuContext = createContext<MenuContextType | undefined>(undefined);

export function MenuProvider({ children }: { children: ReactNode }) {
  const [menuAberto, setMenuAberto] = useState(false);
  return (
    <MenuContext.Provider
      value={{
        menuAberto,
        abrirMenu: () => setMenuAberto(true),
        fecharMenu: () => setMenuAberto(false),
      }}
    >
      {children}
    </MenuContext.Provider>
  );
}

export function useMenu() {
  const ctx = useContext(MenuContext);
  if (!ctx) throw new Error("useMenu precisa estar dentro de um MenuProvider");
  return ctx;
}
