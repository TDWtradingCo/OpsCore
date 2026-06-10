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

function compactLabel(label: string, maxLength = 48) {
  if (label.length <= maxLength) return label
  return `${label.slice(0, maxLength - 3).trimEnd()}...`
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
  const triggerRef = useRef<HTMLButtonElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const filtered = options.filter(opt =>
    opt.label.toLowerCase().includes(search.toLowerCase()) ||
    opt.value.toLowerCase().includes(search.toLowerCase())
  )

  const selectedLabel = options.find(opt => opt.value === value)?.label
  const triggerLabel = selectedLabel ? compactLabel(selectedLabel) : placeholder

  const closeDropdown = () => {
    setOpen(false)
    setSearch('')
  }

  const toggleDropdown = () => {
    if (disabled) return
    if (open) {
      closeDropdown()
      return
    }

    setOpen(true)
  }

  useEffect(() => {
    if (!open) return
    inputRef.current?.focus({ preventScroll: true })
  }, [open])

  useEffect(() => {
    if (!open) return
    const handleClickOutside = (e: MouseEvent) => {
      if (
        !triggerRef.current?.contains(e.target as Node) &&
        !dropdownRef.current?.contains(e.target as Node)
      ) {
        closeDropdown()
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  return (
    <div className="relative w-full min-w-0">
      <Button
        ref={triggerRef}
        type="button"
        variant="outline"
        role="combobox"
        aria-expanded={open}
        className="flex w-full max-w-full min-w-0 justify-between overflow-hidden"
        onClick={toggleDropdown}
        disabled={disabled}
        title={selectedLabel || placeholder}
      >
        <span className="block min-w-0 flex-1 basis-0 overflow-hidden text-ellipsis whitespace-nowrap text-left">
          {triggerLabel}
        </span>
        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
      </Button>

      {open && !disabled && (
        <div
          ref={dropdownRef}
          className="absolute left-0 right-0 top-full z-[70] mt-1 overflow-hidden rounded-md border border-border bg-white shadow-lg dark:bg-gray-950"
        >
          <div className="p-2 border-b">
            <Input
              ref={inputRef}
              placeholder="Search..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8"
            />
          </div>
          <div className="max-h-72 overflow-y-auto overscroll-contain" onWheel={(e) => e.stopPropagation()}>
            {filtered.length === 0 ? (
              <div className="p-2 text-sm text-muted-foreground text-center">No results found</div>
            ) : (
              filtered.map((option) => (
                <button
                  type="button"
                  key={option.value}
                  onClick={() => {
                    onValueChange(option.value)
                    closeDropdown()
                  }}
                  className={cn(
                    'flex w-full max-w-full min-w-0 items-center justify-between gap-2 overflow-hidden px-2 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground',
                    value === option.value && 'bg-accent text-accent-foreground'
                  )}
                  title={option.label}
                >
                  <span className="block min-w-0 flex-1 basis-0 overflow-hidden text-ellipsis whitespace-nowrap">{option.label}</span>
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
