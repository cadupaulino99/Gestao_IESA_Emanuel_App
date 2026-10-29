import * as React from "react"
import * as LabelPrimitive from "@radix-ui/react-label"
import { AlertCircle } from "lucide-react"
import { Slot } from "@radix-ui/react-slot"
import {
  Controller,
  FormProvider,
  useFormContext,
  type ControllerProps,
  type FieldPath,
  type FieldValues,
} from "react-hook-form"

import { cn } from "@/src/lib/utils"
import { Label } from "@/src/components/ui/label"

const Form = FormProvider

type FormFieldContextValue<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>
> = {
  name: TName
}

const FormFieldContext = React.createContext<FormFieldContextValue | null>(null)

const FormField = <
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>
>({
  ...props
}: ControllerProps<TFieldValues, TName>) => {
  return (
    <FormFieldContext.Provider value={{ name: props.name }}>
      <Controller {...props} />
    </FormFieldContext.Provider>
  )
}

const useFormField = () => {
  const fieldContext = React.useContext(FormFieldContext)
  const itemContext = React.useContext(FormItemContext)
  const { getFieldState, formState } = useFormContext()

  if (!fieldContext) {
    throw new Error("useFormField should be used within <FormField>")
  }

  if (!itemContext) {
    throw new Error("useFormField should be used within <FormItem>")
  }

  const fieldState = getFieldState(fieldContext.name, formState)

  const { id } = itemContext

  return {
    id,
    name: fieldContext.name,
    formItemId: `${id}-form-item`,
    formDescriptionId: `${id}-form-item-description`,
    formMessageId: `${id}-form-item-message`,
    ...fieldState,
  }
}

type FormItemContextValue = {
  id: string
}

const FormItemContext = React.createContext<FormItemContextValue | null>(null)

const FormItem = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => {
  const id = React.useId()

  return (
    <FormItemContext.Provider value={{ id }}>
      <div ref={ref} className={cn("space-y-2", className)} {...props} />
    </FormItemContext.Provider>
  )
})
FormItem.displayName = "FormItem"

const FormLabel = React.forwardRef<
  React.ElementRef<typeof LabelPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root>
>(({ className, ...props }, ref) => {
  const { error, formItemId } = useFormField()

  return (
    <Label
      ref={ref}
      className={cn(error && "text-destructive", className)}
      htmlFor={formItemId}
      {...props}
    />
  )
})
FormLabel.displayName = "FormLabel"

const FormControl = React.forwardRef<
  React.ElementRef<typeof Slot>,
  React.ComponentPropsWithoutRef<typeof Slot>
>(({ ...props }, ref) => {
  const { error, formItemId, formDescriptionId, formMessageId } = useFormField()

  return (
    <Slot
      ref={ref}
      id={formItemId}
      aria-describedby={
        !error
          ? `${formDescriptionId}`
          : `${formDescriptionId} ${formMessageId}`
      }
      aria-invalid={!!error}
      {...props}
    />
  )
})
FormControl.displayName = "FormControl"

const FormDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => {
  const { formDescriptionId } = useFormField()

  return (
    <p
      ref={ref}
      id={formDescriptionId}
      className={cn("text-[0.8rem] text-muted-foreground", className)}
      {...props}
    />
  )
})
FormDescription.displayName = "FormDescription"

const FormMessage = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, children, ...props }, ref) => {
  const { error, formMessageId } = useFormField()
  const body = error ? String(error?.message ?? "") : children

  if (!body) {
    return null
  }

  return (
    <p
      ref={ref}
      id={formMessageId}
      className={cn(
        "flex items-start gap-1.5 text-body-sm font-medium text-danger-foreground [&>svg]:mt-0.5 [&>svg]:size-4 [&>svg]:shrink-0",
        className
      )}
      {...props}
    >
      <AlertCircle aria-hidden />
      <span>{body}</span>
    </p>
  )
})
FormMessage.displayName = "FormMessage"

/* FASE 3 — erro de campo fora de FormField: ícone + texto sob o campo,
   com o mesmo aspecto do FormMessage. */
const FieldError = ({ children, className }: { children?: React.ReactNode; className?: string }) => {
  if (!children) return null
  return (
    <p
      role="alert"
      className={cn(
        "flex items-start gap-1.5 text-body-sm font-medium text-danger-foreground [&>svg]:mt-0.5 [&>svg]:size-4 [&>svg]:shrink-0",
        className
      )}
    >
      <AlertCircle aria-hidden />
      <span>{children}</span>
    </p>
  )
}

/* FASE 3 — secção de formulário: legenda sempre visível + grelha de campos
   (1 coluna no telemóvel, 2 colunas ≥640 px via .form-grid). */
const FormSection = React.forwardRef<
  React.ElementRef<"fieldset">,
  React.HTMLAttributes<HTMLFieldSetElement> & { title: string; description?: string }
>(({ title, description, className, children, ...props }, ref) => (
  <fieldset ref={ref} className={cn("space-y-3", className)} {...props}>
    <legend className="text-caption font-semibold uppercase tracking-wider text-muted-foreground">
      {title}
    </legend>
    {description && <p className="text-body-sm text-muted-foreground">{description}</p>}
    <div className="form-grid">{children}</div>
  </fieldset>
))
FormSection.displayName = "FormSection"

export {
  useFormField,
  Form,
  FormItem,
  FormLabel,
  FormControl,
  FormDescription,
  FormMessage,
  FormField,
  FormSection,
  FieldError,
}
