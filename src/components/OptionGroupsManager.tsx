import { useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import * as servicesApi from "@/services/services";
import { formatCentsToBRL } from "@/lib/utils";
import type { SelectionType, ServiceItem, ServiceItemOptionGroup } from "@/lib/types";

function OptionGroupRow({
  itemId,
  group,
  onDeleteGroup,
  isNegotiable,
}: {
  itemId: string;
  group: ServiceItemOptionGroup;
  onDeleteGroup: () => void;
  isNegotiable: boolean;
}) {
  const queryClient = useQueryClient();
  const [addingOption, setAddingOption] = useState(false);
  const [optName, setOptName] = useState("");
  const [optDelta, setOptDelta] = useState("0");

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["my-service"] });
  }

  const addOptionMutation = useMutation({
    mutationFn: () =>
      servicesApi.addOption(itemId, group.id, {
        name: optName,
        priceDeltaCents: Math.round(Number(optDelta.replace(",", ".") || "0") * 100),
      }),
    onSuccess: () => {
      setAddingOption(false);
      setOptName("");
      setOptDelta("0");
      invalidate();
    },
  });

  const deleteOptionMutation = useMutation({
    mutationFn: (optionId: string) => servicesApi.deleteOption(itemId, group.id, optionId),
    onSuccess: invalidate,
  });

  function handleAddOption(e: FormEvent) {
    e.preventDefault();
    if (!optName.trim()) return;
    addOptionMutation.mutate();
  }

  return (
    <div className="rounded border p-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium">
          {group.name}{" "}
          <span className="text-xs font-normal text-muted-foreground">
            ({group.selectionType === "single" ? "escolhe 1" : `até ${group.maxSelections}`}
            {group.required ? ", obrigatório" : ""})
          </span>
        </p>
        <Button type="button" size="sm" variant="ghost" onClick={onDeleteGroup}>
          Excluir grupo
        </Button>
      </div>
      <div className="mt-1.5 space-y-1">
        {group.options.map((option) => (
          <div key={option.id} className="flex items-center justify-between text-xs">
            <span>
              {option.name}
              {option.priceDeltaCents !== 0 &&
                ` (${option.priceDeltaCents > 0 ? "+" : ""}${formatCentsToBRL(option.priceDeltaCents)})`}
            </span>
            <button
              type="button"
              onClick={() => deleteOptionMutation.mutate(option.id)}
              className="text-muted-foreground hover:text-destructive"
              aria-label="Remover opção"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ))}
        {group.options.length === 0 && <p className="text-xs text-muted-foreground">Nenhuma opção ainda.</p>}
      </div>
      {addingOption ? (
        <form onSubmit={handleAddOption} className="mt-2 flex items-center gap-1.5">
          <Input
            placeholder="Nome da opção"
            value={optName}
            onChange={(e) => setOptName(e.target.value)}
            className="h-8 text-xs"
          />
          {!isNegotiable && (
            <Input
              placeholder="+/- R$"
              value={optDelta}
              onChange={(e) => setOptDelta(e.target.value)}
              className="h-8 w-20 text-xs"
            />
          )}
          <Button type="submit" size="sm" className="h-8" disabled={addOptionMutation.isPending}>
            OK
          </Button>
          <Button type="button" size="sm" variant="outline" className="h-8" onClick={() => setAddingOption(false)}>
            <X className="h-3 w-3" />
          </Button>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setAddingOption(true)}
          className="mt-1.5 text-xs text-primary underline"
        >
          + opção
        </button>
      )}
    </div>
  );
}

export function OptionGroupsManager({ item }: { item: ServiceItem }) {
  const queryClient = useQueryClient();
  const [addingGroup, setAddingGroup] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [selectionType, setSelectionType] = useState<SelectionType>("single");
  const [maxSelections, setMaxSelections] = useState("2");
  const [required, setRequired] = useState(false);

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["my-service"] });
  }

  const addGroupMutation = useMutation({
    mutationFn: () =>
      servicesApi.addOptionGroup(item.id, {
        name: groupName,
        selectionType,
        maxSelections: selectionType === "multi" ? Number(maxSelections) || 1 : null,
        required,
      }),
    onSuccess: () => {
      setAddingGroup(false);
      setGroupName("");
      setRequired(false);
      invalidate();
    },
  });

  const deleteGroupMutation = useMutation({
    mutationFn: (groupId: string) => servicesApi.deleteOptionGroup(item.id, groupId),
    onSuccess: invalidate,
  });

  function handleAddGroup(e: FormEvent) {
    e.preventDefault();
    if (!groupName.trim()) return;
    addGroupMutation.mutate();
  }

  return (
    <div className="space-y-2 rounded-md border bg-muted/20 p-3">
      <p className="text-sm font-medium">Opções de configuração (ex: toppings, sabores, cobertura)</p>
      {item.optionGroups.map((group) => (
        <OptionGroupRow
          key={group.id}
          itemId={item.id}
          group={group}
          isNegotiable={item.isNegotiable}
          onDeleteGroup={() => deleteGroupMutation.mutate(group.id)}
        />
      ))}
      {addingGroup ? (
        <form onSubmit={handleAddGroup} className="space-y-2 rounded border p-2">
          <Input placeholder="Nome do grupo (ex: Toppings)" value={groupName} onChange={(e) => setGroupName(e.target.value)} />
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={selectionType}
              onChange={(e) => setSelectionType(e.target.value as SelectionType)}
              className="h-9 rounded-md border border-input bg-background px-2 text-sm"
            >
              <option value="single">Escolhe 1</option>
              <option value="multi">Escolhe várias</option>
            </select>
            {selectionType === "multi" && (
              <Input
                type="number"
                min={1}
                max={20}
                className="h-9 w-20"
                value={maxSelections}
                onChange={(e) => setMaxSelections(e.target.value)}
              />
            )}
            <label className="flex items-center gap-1.5 text-xs">
              <input type="checkbox" checked={required} onChange={(e) => setRequired(e.target.checked)} />
              Obrigatório
            </label>
          </div>
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={addGroupMutation.isPending}>
              Salvar grupo
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => setAddingGroup(false)}>
              Cancelar
            </Button>
          </div>
        </form>
      ) : (
        <Button type="button" size="sm" variant="outline" onClick={() => setAddingGroup(true)}>
          + Grupo de opção
        </Button>
      )}
    </div>
  );
}
