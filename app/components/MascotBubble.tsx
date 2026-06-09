export default function MascotBubble({ image, text }: { image: string; text: string }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <img
        src={`/mascot/${image}`}
        alt=""
        width={120}
        height={120}
        className="h-[120px] w-[120px] object-contain"
      />
      <div className="relative mt-1 max-w-[260px] rounded-2xl border border-[#7c6dfa]/20 bg-[#13131a] px-4 py-3 text-center text-sm leading-relaxed text-[#e8e6f0]/80">
        <span className="absolute -top-1.5 left-1/2 h-3 w-3 -translate-x-1/2 rotate-45 border-l border-t border-[#7c6dfa]/20 bg-[#13131a]" />
        {text}
      </div>
    </div>
  );
}
