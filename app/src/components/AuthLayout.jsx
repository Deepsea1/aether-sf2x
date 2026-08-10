import React from "react";
import { Link } from "react-router-dom";
import MobileBackHeader from "@/components/sf2x/MobileBackHeader";
import AuthMarketingPanel from "@/components/sf2x/AuthMarketingPanel";

export default function AuthLayout({ icon: Icon, title, subtitle, footer, children }) {
  return (
    <div className="min-h-screen flex flex-col bg-background pb-[env(safe-area-inset-bottom)]">
      <MobileBackHeader />
      <div className="flex-1 flex items-center justify-center px-4">
        <div className="w-full max-w-5xl grid lg:grid-cols-2 gap-10 items-center">
          <AuthMarketingPanel />
          <div className="w-full max-w-md mx-auto lg:mx-0">
            <div className="text-center mb-10">
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-emerald-400 to-teal-600 mb-4">
                <Icon className="w-7 h-7 text-[#070A0F]" aria-hidden="true" />
              </div>
              <h1 className="text-3xl font-bold tracking-tight text-foreground">{title}</h1>
              {subtitle && <p className="text-muted-foreground mt-2">{subtitle}</p>}
            </div>
            <div className="bg-card rounded-2xl shadow-sm border border-border p-8">
              {children}
            </div>
            {footer && (
              <p className="text-center text-sm text-muted-foreground mt-6">{footer}</p>
            )}
            <div className="mt-4 flex items-center justify-center gap-x-5 gap-y-1 text-xs flex-wrap text-center">
              <Link to="/playground" className="text-emerald-500 font-medium hover:underline">Try the Playground</Link>
              <Link to="/benchmark" className="text-muted-foreground hover:text-foreground">Benchmark</Link>
              <Link to="/pricing" className="text-muted-foreground hover:text-foreground">Pricing</Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}