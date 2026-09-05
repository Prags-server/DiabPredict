"use client";

const navigation = [
  { name: "Training data", href: "#dataset" },
  { name: "Prediction", href: "#prediction" },
  { name: "History", href: "#history" },
];

export function MainNav() {
  return (
    <nav aria-label="Workspace navigation" className="hidden md:flex items-center gap-5">
      {navigation.map((item) => (
        <a
          key={item.name}
          href={item.href}
          className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          {item.name}
        </a>
      ))}
    </nav>
  );
}
