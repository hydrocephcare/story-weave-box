import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { ChevronRight, Eye, EyeOff, Loader2, RotateCcw, Lock, Clock, Pause, Play } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import OmpathMark from "@/components/ai/OmpathMark";
import { Helmet } from "react-helmet-async";
import { trackAnswer } from "@/lib/answer-tracker";
import { trackEngagement } from "@/lib/analytics";
import { openAI } from "@/lib/aiEvents";
import { isExamLike, resolveMcqSet, shuffleOptions, type McqSetRow } from "@/lib/mcqSet";
import { examUnit, examYear, shortTitle } from "@/lib/examMeta";
import { resourceSeoTitle } from "@/lib/resourceSeoTitle";
import { getSetting } from "@/lib/store";
import { useAccess } from "@/lib/access";
import { Paywall } from "@/components/Paywall";
import { supabase } from "@/integrations/supabase/client";

const LETTERS = "ABCDEF";
const mixOrder = <T,>(a: T[]): T[] => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };
type PracticeSnapshot = {
  qs?: McqSetRow["questions"];
  first?: [number, number][];
  wrong?: [number, number[]][];
  solved?: number[];
  shown?: number[];
  timerMinutes?: numb¶»§q«^