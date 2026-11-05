import { Instagram } from "lucide-react";
import { Link } from "react-router-dom";
import { ThemedLogo } from "@/components/common/ThemedLogo";

export const Footer = () => {
  return (
    <footer className="border-t border-border/50 bg-surface/50">
      <div className="container mx-auto px-6 py-12">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
          {/* Brand */}
          <div className="text-center md:text-left">
            <Link to="/" className="inline-block mb-2">
              <ThemedLogo className="h-10 w-auto" />
            </Link>
            <p className="text-sm text-muted-foreground">
              Premium Custom Jewelry
            </p>
          </div>

          {/* Legal Links */}
          <div className="flex items-center gap-6 text-sm">
            <Link to="/privacy" className="text-muted-foreground hover:text-foreground transition-colors">
              Privacy Policy
            </Link>
            <Link to="/terms" className="text-muted-foreground hover:text-foreground transition-colors">
              Terms of Service
            </Link>
          </div>

          {/* Social */}
          <div className="flex items-center gap-4">
            <a
              href="#"
              className="w-10 h-10 rounded-full bg-background border border-border flex items-center justify-center hover:border-foreground hover:bg-muted transition-all"
              aria-label="Instagram"
            >
              <Instagram className="w-5 h-5" />
            </a>
          </div>

          {/* Copyright */}
          <div className="text-center md:text-right">
            <p className="text-sm text-muted-foreground">
              © 2024 Aurezo. All rights reserved.
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
};
