"use client";

import { format } from "date-fns";
import { CalendarIcon } from "lucide-react";

import { type DateRange } from "react-day-picker";

import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Calendar } from "@/components/ui/multicalendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import React from "react";

type DateRangePickerProps = {
  date: DateRange | undefined;
  onSelect: (date: DateRange | undefined) => void;
};

export function DateRangePicker({ date, onSelect }: DateRangePickerProps) {
  const [open, setOpen] = React.useState(false);
  const [draftDate, setDraftDate] = React.useState<DateRange | undefined>(date);

  React.useEffect(() => {
    if (!open) {
      setDraftDate(date);
    }
  }, [date, open]);

  function handleOpenChange(nextOpen: boolean) {
    if (nextOpen) {
      setDraftDate(date);
    }

    setOpen(nextOpen);
  }

  function handleReset() {
    setDraftDate(undefined);
  }

  function handleApply() {
    onSelect(draftDate);
    setOpen(false);
  }

  return (
    <Field className="w-full min-w-[240px]">
      <FieldLabel htmlFor="date-picker-range">Date Range</FieldLabel>
      <Popover open={open} onOpenChange={handleOpenChange}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            id="date-picker-range"
            className="h-[48px] w-full justify-start rounded-[22px] border border-white/16 bg-white/10 px-4 py-3 font-normal text-white shadow-none hover:bg-white/14 hover:text-white aria-expanded:border-white/18 aria-expanded:bg-white/10 aria-expanded:text-white"
          >
            <CalendarIcon className="h-4 w-4 text-white/72" />
            <div className="mt-1 ml-2">
            {date?.from ? (
              date.to ? (
                <>
                  {format(date.from, "LLL dd, y")} - {format(date.to, "LLL dd, y")}
                </>
              ) : (
                format(date.from, "LLL dd, y")
              )
            ) : (
              <span className="text-white/60">Pick a date range</span>
            )}</div>
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="w-auto gap-0 rounded-[28px] border-none bg-transparent p-0 text-white shadow-none ring-0"
          align="start"
        >
          <div className="overflow-hidden rounded-[28px] bg-[#241714]/95">
            <Calendar
              mode="range"
              defaultMonth={draftDate?.from ?? date?.from}
              selected={draftDate}
              onSelect={setDraftDate}
              numberOfMonths={2}
            />
            <div className="flex items-center justify-between gap-4 border-t border-white/10 px-4 py-3">
              <Button
                type="button"
                variant="ghost"
                className="rounded-xl px-4 text-white/72 hover:bg-white/8 hover:text-white"
                onClick={handleReset}
              >
                Reset
              </Button>
              <Button
                type="button"
                className="rounded-xl border border-[#ffb4b4]/18 bg-[#a33340] px-5 text-white shadow-none hover:bg-[#bb3d4c]"
                onClick={handleApply}
              >
                Apply
              </Button>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </Field>
  );
}
