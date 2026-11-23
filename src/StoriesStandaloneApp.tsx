import { Link, Navigate, Route, Routes } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as SonnerToaster } from "@/components/ui/sonner";
import Stories from "@/pages/Stories";
import StoryRead from "@/pages/StoryRead";
import Login from "@/pages/Login";
import AuthCallback from "@/pages/AuthCallback";
import ShareYourStory from "@/pages/ShareYourStory";
import { PenLine, BookOpen, LogOut, UserRound } from "lucide-react";

function StoriesNavigation() {
  const { user, signOut } = useAuth();
  return <header className="sticky top-0 z-40 border-b border-border/80 bg-background/95 backdrop-blur">
    <div className="mx-auto flex h-[68px] max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
      <Link to="/" className="flex items-center gap-2.5 no-underline">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground"><BookOpen className="h-5 w-5"/></span>
        <span className="font-serif text-2xl font-bold tracking-tight text-foreground">Stories<span className="text-primary">.</span></span>
      </Link>
      <nav className="flex items-center gap-2 sm:gap-4">
        <Link to="/stories" className="hidden text-sm font-semibold text-muted-foreground hover:text-primary sm:inline">Explore</Link>
        <Link to="/share-your-story" className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3.5 py-2.5 text-sm font-bold text-primary-foreground hover:bg-primary/90 sm:px-4"><PenLine className="h-4 w-4"/> <span>Write</span></Link>
        {user ? <button onClick={() => void signOut()} className="inline-flex items-center gap-1.5 rounded-xl border border-border px-3 py-2.5 text-sm font-semibold hover:border-primary"><LogOut className="h-4 w-4"/><span className="hidden sm:inline">Sign out</span></button> : <Link to="/login" className="inline-flex items-center gap-1.5 rounded-xl border border-border px-3 py-2.5 text-sm font-semibold hover:border-primary"><UserRound className="h-4 w-4"/><span>Sign in</span></Link>}
      </nav>
    </div>
  </header>;
}

function StoriesFooter() {
  return <footer className="mt-16 border-t border-border bg-muted/30 py-8">
    <div className="mx-auto flex max-w-6xl flex-col gap-3 px-5 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
      <p><strong className="font-serif text-lg text-foreground">Stories.</strong> Independent voices. Real experiences.</p>
      <div className="flex flex-wrap gap-4"><Link to="/stories" className="hover:text-primary">Explore</Link><Link to="/share-your-story" className="hover:text-primary">Publish a story</Link><a href="https://www.ompathstudy.com" className="hover:text-primary">OmpathStudy</a></div>
    </div>
  </footer>;
}

function StoriesRoutes() {
  return <>
    <StoriesNavigation/>
    <Routes>
      <Route path="/" element={<Stories/>}/>
      <Route path="/stories" element={<Stories/>}/>
      <Route path="/stories/:id" element={<StoryRead/>}/>
      <Route path="/share-your-story" element={<ShareYourStory/>}/>
      <Route path="/share-your-story/:who" element={<ShareYourStory/>}/>
      <Route path="/finalists" element={<ShareYourStory audience="finalist"/>}/>
      <Route path="/login" element={<Login/>}/>
      <Route path="/auth/callback" element={<AuthCallback/>}/>
      <Route path="/account" element={<Navigate to="/stories" replace/>}/>
      <Route path="*" element={<Navigate to="/stories" replace/>}/>
    </Routes>
    <StoriesFooter/>
  </>;
}

export default function StoriesStandaloneApp() {
  return <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster/><SonnerToaster/>
        <StoriesRoutes/>
      </TooltipProvider>
    </AuthProvider>
  </ThemeProvider>;
}
