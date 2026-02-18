interface Toast {
	id: string;
	message: string;
	type: 'success' | 'error' | 'info';
}

let counter = 0;

class ToastState {
	toasts = $state<Toast[]>([]);

	add(message: string, type: Toast['type'] = 'info', duration: number = 3000): void {
		const id = `toast-${++counter}`;
		this.toasts = [...this.toasts, { id, message, type }];

		if (duration > 0) {
			setTimeout(() => this.remove(id), duration);
		}
	}

	remove(id: string): void {
		this.toasts = this.toasts.filter((t) => t.id !== id);
	}

	success(message: string): void {
		this.add(message, 'success');
	}

	error(message: string): void {
		this.add(message, 'error', 5000);
	}

	info(message: string): void {
		this.add(message, 'info');
	}
}

export const toastState = new ToastState();
