from aiogram.fsm.state import State, StatesGroup


class ClientReg(StatesGroup):
    waiting_name = State()           # FIO manually
    waiting_phone_text = State()     # Phone number manually (text)
    waiting_location = State()       # Show 2 buttons: share location OR type address
    waiting_location_text = State()  # Type address manually


class CourierReg(StatesGroup):
    waiting_fullname = State()
    waiting_phone = State()
    waiting_car_number = State()
