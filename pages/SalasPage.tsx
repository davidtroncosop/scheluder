import React, { useState, useEffect } from 'react';
import { MainLayout } from '../components/MainLayout';
import * as dataStore from '../lib/dataStore';

interface Room {
    id: string;
    name: string;
    building: string | null;
    floor: number | null;
    type: 'TEO' | 'LAB' | 'SIM' | 'TAL' | 'AUD';
    capacity: number;
    is_shared: boolean;
}

const API_BASE = '/api';

const SalasPage: React.FC = () => {
    const [rooms, setRooms] = useState<Room[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedType, setSelectedType] = useState<string | null>(null);
    const [selectedPeriod, setSelectedPeriod] = useState('2026-1');

    // Modal State
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingRoom, setEditingRoom] = useState<Room | null>(null);
    const [formData, setFormData] = useState({
        name: '',
        building: '',
        floor: 1,
        type: 'TEO' as Room['type'],
        capacity: 30,
        is_shared: false,
    });

    const roomTypeColors: Record<string, string> = {
        TEO: 'bg-blue-500',
        LAB: 'bg-emerald-500',
        SIM: 'bg-purple-500',
        TAL: 'bg-amber-500',
        AUD: 'bg-rose-500',
    };

    const roomTypeNames: Record<string, string> = {
        TEO: 'Teórica',
        LAB: 'Laboratorio',
        SIM: 'Simulación',
        TAL: 'Taller',
        AUD: 'Auditorio',
    };

    const getRoomColor = (type: string): string => {
        const upperType = (type || 'TEO').toUpperCase();
        return roomTypeColors[upperType] || 'bg-blue-500';
    };

    const getRoomTypeName = (type: string): string => {
        const upperType = (type || 'TEO').toUpperCase();
        return roomTypeNames[upperType] || 'Teórica';
    };

    const loadRoomsList = () => {
        setLoading(true);
        // First try localStorage
        const localRooms = dataStore.getRooms();
        if (localRooms.length > 0) {
            const converted: Room[] = localRooms.map(r => ({
                id: r.id,
                name: r.nombre,
                building: r.edificio || null,
                floor: null,
                type: r.tipo as Room['type'],
                capacity: r.capacidad,
                is_shared: false,
            }));
            setRooms(converted);
            setLoading(false);
            return;
        }

        // Mock Fallback
        const mock: Room[] = [
            { id: '1', name: 'SALA 204', building: 'Edificio D', floor: 2, type: 'TEO', capacity: 40, is_shared: false },
            { id: '2', name: 'LAB 1', building: 'Edificio D', floor: 1, type: 'LAB', capacity: 20, is_shared: false },
            { id: '3', name: 'SIMULACIÓN 1', building: 'Edificio D', floor: 1, type: 'SIM', capacity: 15, is_shared: false },
            { id: '4', name: 'AUDITORIO A', building: 'Edificio Central', floor: 1, type: 'AUD', capacity: 200, is_shared: true },
            { id: '5', name: 'SALA 305', building: 'Edificio D', floor: 3, type: 'TEO', capacity: 35, is_shared: false },
            { id: '6', name: 'LAB 2', building: 'Edificio D', floor: 1, type: 'LAB', capacity: 20, is_shared: false },
        ];
        setRooms(mock);
        // Write mock to dataStore to initialize
        const convertedMock: dataStore.ImportedRoom[] = mock.map(m => ({
            id: m.id,
            nombre: m.name,
            tipo: m.type as any,
            capacidad: m.capacity,
            edificio: m.building || '',
        }));
        dataStore.saveRooms(convertedMock);
        setLoading(false);
    };

    useEffect(() => {
        loadRoomsList();
    }, []);

    const openModal = (room?: Room) => {
        if (room) {
            setEditingRoom(room);
            setFormData({
                name: room.name,
                building: room.building || '',
                floor: room.floor || 1,
                type: room.type,
                capacity: room.capacity,
                is_shared: room.is_shared,
            });
        } else {
            setEditingRoom(null);
            setFormData({
                name: '',
                building: '',
                floor: 1,
                type: 'TEO',
                capacity: 30,
                is_shared: false,
            });
        }
        setIsModalOpen(true);
    };

    const handleSaveRoom = (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.name.trim()) return;

        const id = editingRoom ? editingRoom.id : `room-${Date.now()}`;
        const newRoomData: dataStore.ImportedRoom = {
            id,
            nombre: formData.name,
            tipo: formData.type as any,
            capacidad: Number(formData.capacity),
            edificio: formData.building,
        };

        dataStore.addOrUpdateRoom(newRoomData);
        loadRoomsList();
        setIsModalOpen(false);
    };

    const handleDeleteRoom = (id: string, name: string) => {
        if (window.confirm(`¿Está seguro de que desea eliminar la sala "${name}"?`)) {
            dataStore.deleteRoom(id);
            setRooms(prev => prev.filter(r => r.id !== id));
        }
    };

    const types = [...new Set(rooms.map(r => r.type))];
    const filteredRooms = selectedType ? rooms.filter(r => r.type === selectedType) : rooms;

    return (
        <MainLayout
            title="Salas y Espacios"
            selectedPeriod={selectedPeriod}
            onPeriodChange={setSelectedPeriod}
            actions={
                <div className="flex items-center gap-4">
                    <span className="text-xs font-bold text-slate-400 bg-slate-100 dark:bg-slate-800 px-3 py-1.5 rounded-full border border-slate-200 dark:border-slate-700">
                        {rooms.length} salas registradas
                    </span>
                    <button 
                        onClick={() => openModal()}
                        className="flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-lg font-bold hover:bg-primary-dark transition-all shadow-md shadow-primary/20"
                    >
                        <span className="material-symbols-outlined">add</span>
                        Nueva Sala
                    </button>
                </div>
            }
        >
            <div className="flex flex-col gap-6 animate-fade-in">
                {/* Type Filter */}
                <div className="flex gap-2 pb-2 overflow-x-auto custom-scrollbar">
                    <button
                        onClick={() => setSelectedType(null)}
                        className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all shrink-0 ${!selectedType ? 'bg-primary text-white shadow-md shadow-primary/20' : 'bg-white dark:bg-slate-800 text-slate-500 border border-slate-100 dark:border-slate-700 hover:bg-slate-50'}`}
                    >
                        Todos
                    </button>
                    {types.map(type => (
                        <button
                            key={type}
                            onClick={() => setSelectedType(type)}
                            className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all shrink-0 flex items-center gap-2 ${selectedType === type ? 'bg-primary text-white shadow-md shadow-primary/20' : 'bg-white dark:bg-slate-800 text-slate-500 border border-slate-100 dark:border-slate-700 hover:bg-slate-50'}`}
                        >
                            <span className={`size-2 rounded-full ${getRoomColor(type)} group-hover:scale-125 transition-transform`}></span>
                            {getRoomTypeName(type)}
                        </button>
                    ))}
                </div>

                {loading ? (
                    <div className="flex items-center justify-center py-12 h-64">
                        <div className="animate-spin size-8 border-2 border-primary border-t-transparent rounded-full"></div>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                        {filteredRooms.map(room => (
                            <div key={room.id} className="group bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-5 hover:border-primary/50 hover:shadow-xl hover:shadow-primary/5 transition-all duration-300">
                                <div className="flex items-start justify-between mb-4">
                                    <div className={`size-12 rounded-2xl ${getRoomColor(room.type)}/10 flex items-center justify-center group-hover:scale-110 transition-transform`}>
                                        <span className={`material-symbols-outlined ${getRoomColor(room.type).replace('bg-', 'text-')}`}>meeting_room</span>
                                    </div>
                                    <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider text-white ${getRoomColor(room.type)}`}>
                                        {room.type}
                                    </span>
                                </div>

                                <h3 className="text-base font-bold text-slate-900 dark:text-white mb-1">{room.name}</h3>
                                <p className="text-xs text-slate-400 font-medium mb-4">{room.building || 'Edificio no especificado'}</p>

                                <div className="pt-4 border-t border-slate-50 dark:border-slate-800 flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="flex items-center gap-1 text-slate-500">
                                            <span className="material-symbols-outlined text-sm">group</span>
                                            <span className="text-[11px] font-bold">{room.capacity}</span>
                                        </div>
                                        {room.floor && (
                                            <div className="flex items-center gap-1 text-slate-500">
                                                <span className="material-symbols-outlined text-sm">stairs</span>
                                                <span className="text-[11px] font-bold">P{room.floor}</span>
                                            </div>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-1">
                                        {room.is_shared && (
                                            <span className="material-symbols-outlined text-primary text-sm mr-1" title="Sala Compartida">share</span>
                                        )}
                                        <button 
                                            onClick={() => openModal(room)}
                                            className="size-8 rounded-lg text-slate-400 hover:text-primary hover:bg-primary/5 transition-all flex items-center justify-center"
                                            title="Editar Sala"
                                        >
                                            <span className="material-symbols-outlined text-lg">edit</span>
                                        </button>
                                        <button 
                                            onClick={() => handleDeleteRoom(room.id, room.name)}
                                            className="size-8 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-500/5 transition-all flex items-center justify-center"
                                            title="Eliminar Sala"
                                        >
                                            <span className="material-symbols-outlined text-lg">delete</span>
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {filteredRooms.length === 0 && !loading && (
                    <div className="text-center py-20 bg-white dark:bg-slate-900 rounded-3xl border border-dashed border-slate-200 dark:border-slate-800">
                        <span className="material-symbols-outlined text-5xl text-slate-200 mb-4">meeting_room</span>
                        <p className="text-slate-400 font-bold uppercase text-xs">No se encontraron salas</p>
                    </div>
                )}
            </div>

            {/* Modal de Registro/Edición de Sala */}
            {isModalOpen && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in">
                    <div className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-md shadow-2xl p-6 relative overflow-hidden">
                        <div className="flex items-center justify-between mb-5">
                            <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                                <span className="material-symbols-outlined text-primary">meeting_room</span>
                                {editingRoom ? 'Editar Sala' : 'Registrar Nueva Sala'}
                            </h3>
                            <button 
                                onClick={() => setIsModalOpen(false)}
                                className="size-8 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center transition-all"
                            >
                                <span className="material-symbols-outlined text-lg">close</span>
                            </button>
                        </div>

                        <form onSubmit={handleSaveRoom} className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">
                                    Nombre de la Sala
                                </label>
                                <input
                                    type="text"
                                    required
                                    placeholder="Ej: SALA 204 o LAB 1"
                                    value={formData.name}
                                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                    className="w-full rounded-xl border border-slate-200 dark:border-slate-850 bg-slate-50/50 dark:bg-slate-900/30 px-4 py-2.5 text-sm focus:border-primary focus:ring-primary focus:outline-none dark:text-white transition-all"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">
                                        Edificio
                                    </label>
                                    <input
                                        type="text"
                                        placeholder="Ej: Edificio D"
                                        value={formData.building}
                                        onChange={(e) => setFormData({ ...formData, building: e.target.value })}
                                        className="w-full rounded-xl border border-slate-200 dark:border-slate-850 bg-slate-50/50 dark:bg-slate-900/30 px-4 py-2.5 text-sm focus:border-primary focus:ring-primary focus:outline-none dark:text-white transition-all"
                                    />
                                </div>

                                <div>
                                    <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">
                                        Piso
                                    </label>
                                    <input
                                        type="number"
                                        min={-2}
                                        max={15}
                                        value={formData.floor}
                                        onChange={(e) => setFormData({ ...formData, floor: parseInt(e.target.value) || 1 })}
                                        className="w-full rounded-xl border border-slate-200 dark:border-slate-850 bg-slate-50/50 dark:bg-slate-900/30 px-4 py-2.5 text-sm focus:border-primary focus:ring-primary focus:outline-none dark:text-white transition-all"
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">
                                        Tipo de Sala
                                    </label>
                                    <select
                                        value={formData.type}
                                        onChange={(e) => setFormData({ ...formData, type: e.target.value as any })}
                                        className="w-full rounded-xl border border-slate-200 dark:border-slate-850 bg-slate-50/50 dark:bg-slate-900/30 px-4 py-2.5 text-sm focus:border-primary focus:ring-primary focus:outline-none dark:text-white transition-all"
                                    >
                                        <option value="TEO">Teórica</option>
                                        <option value="LAB">Laboratorio</option>
                                        <option value="SIM">Simulación</option>
                                        <option value="TAL">Taller</option>
                                        <option value="AUD">Auditorio</option>
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">
                                        Capacidad (Alumnos)
                                    </label>
                                    <input
                                        type="number"
                                        required
                                        min={1}
                                        max={500}
                                        value={formData.capacity}
                                        onChange={(e) => setFormData({ ...formData, capacity: parseInt(e.target.value) || 0 })}
                                        className="w-full rounded-xl border border-slate-200 dark:border-slate-850 bg-slate-50/50 dark:bg-slate-900/30 px-4 py-2.5 text-sm focus:border-primary focus:ring-primary focus:outline-none dark:text-white transition-all"
                                    />
                                </div>
                            </div>

                            <div className="flex items-center gap-3 py-2">
                                <input
                                    type="checkbox"
                                    id="is_shared"
                                    checked={formData.is_shared}
                                    onChange={(e) => setFormData({ ...formData, is_shared: e.target.checked })}
                                    className="rounded border-slate-300 dark:border-slate-800 text-primary focus:ring-primary"
                                />
                                <label htmlFor="is_shared" className="text-sm font-semibold text-slate-700 dark:text-slate-300 cursor-pointer select-none">
                                    Sala Compartida (Visible por otras carreras)
                                </label>
                            </div>

                            <div className="pt-4 flex items-center justify-end gap-3 border-t border-slate-100 dark:border-slate-800">
                                <button
                                    type="button"
                                    onClick={() => setIsModalOpen(false)}
                                    className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 text-sm font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-900 transition-all"
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="submit"
                                    className="px-6 py-2.5 rounded-xl bg-primary text-white text-sm font-bold hover:bg-primary-dark shadow-md shadow-primary/20 transition-all"
                                >
                                    {editingRoom ? 'Guardar Cambios' : 'Registrar Sala'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </MainLayout>
    );
};

export default SalasPage;
