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
  const triggerRef = useRef<HTMLButtonElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const filtered = options.filter(opt =>
    opt.label.toLowerCase().includes(search.toLowerCase()) ||
    opt.value.toLowerCase().includes(search.toLowerCase())
  )

  const selectedLabel = options.find(opt => opt.value === value)?.label

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
    <div className="relative w-full">
      <Button
        ref={triggerRef}
        type="button"
        variant="outline"
        role="combobox"
        aria-expanded={open}
        className="w-full justify-between"
        onClick={toggleDropdown}
        disabled={disabled}
      >
        <span className="truncate text-left flex-1">
          {selectedLabel || placeholder}
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
