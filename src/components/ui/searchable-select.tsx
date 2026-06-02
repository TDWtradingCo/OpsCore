import { useState, useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { Check, ChevronsUpDown } from 'lucide-react'

interface SearchableSelectProps {
  value: string
  onValueChange: (value: string) => void
  placeholder?: string
  options: Array<{ value: string; label: string }>
  disabled?: boolean
}

export function SearchableSelect({
  value,
  onValueChange,
  placeholder = 'Select...',
  options,
  disabled = false,
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const filtered = options.filter(opt =>
    opt.label.toLowerCase().includes(search.toLowerCase()) ||
    opt.value.toLowerCase().includes(search.toLowerCase())
  )

  const selectedLabel = options.find(opt => opt.value === value)?.label

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }

    if (open) {
      document.addEventListener('mousedown', handleClickOutside)
      inputRef.current?.focus()
    }

    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  return (
    <div className="relative w-full" ref={containerRef}>
      <Button
        variant="outline"
        role="combobox"
        aria-expanded={open}
        className="w-full justify-between"
        onClick={() => !disabled && setOpen(!open)}
        disabled={disabled}
      >
        <span className="truncate text-left flex-1">
          {selectedLabel || placeholder}
        </span>
        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
      </Button>

      {open && !disabled && (
        <div className="absolute top-full left-0 right-0 z-50 mt-1 border rounded-md bg-popover shadow-md">
          <div className="p-2 border-b">
            <Input
              ref={inputRef}
              placeholder="Search..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8"
            />
          </div>
          <div className="max-h-[200px] overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="p-2 text-sm text-muted-foreground text-center">No results found</div>
            ) : (
              filtered.map((option) => (
                <button
                  key={option.value}
                  onClick={() => {
                    onValueChange(option.value)
                    setOpen(false)
                    setSearch('')
                  }}
                  className={cn(
                    'w-full px-2 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground flex items-center justify-between',
                    value === option.value && 'bg-accent text-accent-foreground'
                  )}
                >
                  <span className="truncate">{option.label}</span>
                  {value === option.value && <Check className="h-4 w-4 shrink-0" />}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
