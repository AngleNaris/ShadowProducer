"use client"

import { ChevronDown } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

export function RelationPicker({
  label,
  options,
  selectedIds,
  disabled,
  onToggle,
}: {
  label: string
  options: { id: string; label: string; detail?: string }[]
  selectedIds: string[]
  disabled?: boolean
  onToggle: (id: string, checked: boolean) => void
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className="w-full justify-between font-normal"
          aria-label={label}
          disabled={disabled}
        >
          <span className="truncate">
            {selectedIds.length ? `${label} · ${selectedIds.length}` : label}
          </span>
          <ChevronDown />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-72 w-72 overflow-y-auto">
        {options.length ? (
          options.map((option) => (
            <DropdownMenuCheckboxItem
              key={option.id}
              checked={selectedIds.includes(option.id)}
              onSelect={(event) => event.preventDefault()}
              onCheckedChange={(checked) => onToggle(option.id, checked === true)}
            >
              <span className="min-w-0">
                <span className="block truncate">{option.label}</span>
                {option.detail ? (
                  <span className="block truncate text-xs text-muted-foreground">
                    {option.detail}
                  </span>
                ) : null}
              </span>
            </DropdownMenuCheckboxItem>
          ))
        ) : (
          <DropdownMenuItem disabled>暂无可选项</DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
