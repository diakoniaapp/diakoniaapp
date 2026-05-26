import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/hooks/useTheme";

interface Props {
  className?: string;
  variant?: "ghost" | "outline";
}

export function ThemeToggle({ className, variant = "ghost" }: Props) {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";
  return (
    <Button
      type="button"
      variant={variant}
      size="sm"
      onClick={toggleTheme}
      aria-label={isDark ? "Ativar tema claro" : "Ativar tema escuro"}
      className={className}
    >
      {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
      <span className="ml-2 text-xs hidden sm:inline">{isDark ? "Tema claro" : "Tema escuro"}</span>
    </Button>
  );
}