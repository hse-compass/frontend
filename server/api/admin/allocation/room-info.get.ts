import {createDirectus, readItems, rest, staticToken} from "@directus/sdk";

export default defineEventHandler(async (event) => {
    const config = useRuntimeConfig();
    const client = createDirectus(config.DIRECTUS_URL).with(staticToken(config.DIRECTUS_TOKEN)).with(rest());
    const {room_id} = getQuery(event)

    if (!room_id) {
        return {error: 'room_id are required'}
    }



    try {

        const room = await client.request<Room[]>(
            readItems('student_accommodation_rooms', {
                fields: ['id', 'max_capacity'],
                filter: { id: { _eq: room_id } },
                limit: 1,
            })
        )

        if (room.length === 0) {
            return { error: 'Room not found' }
        }

        const maxCapacity = room[0].max_capacity

        const today = new Date().toISOString().split('T')[0]

        const occupations = await client.request<Occupation[]>(
            readItems('student_accommodation_room_occupations', {
                fields: [
                    'id',
                    'start_date',
                    'end_date',
                    'user_id.id',
                    'user_id.first_name',
                    'user_id.last_name',
                    'user_id.study_group',
                ],
                filter: {
                    room_id: { _eq: room_id },
                    _or: [
                        { end_date: { _null: true } },
                        { end_date: { _gte: today } },
                    ],
                },
            })
        )

        if (occupations.length === 0) {
            return {
                max_capacity: maxCapacity,
                available_places: maxCapacity,
                residents: [],
            }
        }

        const users_questionnaires=await client.request(readItems('questionnaires',{
            fields:['id','user_id.id'],
            filter:{
                user_id:{
                    _in:occupations.map((occ)=>occ.user_id.id)
                }
            }
        }))



        const residents = occupations.map((occ) => ({
            firstname: occ.user_id?.first_name ?? '',
            lastname: occ.user_id?.last_name ?? '',
            start_date: occ.start_date,
            study_group: occ.user_id?.study_group ?? '',
            user_id: occ.user_id.id,
            anketa_id: users_questionnaires?.length ? users_questionnaires.find((questionnaire) => questionnaire.user_id.id === occ.user_id?.id)?.id : null,
        }))

        const occupiedCount = residents.length
        const availablePlaces = maxCapacity - occupiedCount

        return {
            max_capacity: maxCapacity,
            available_places: availablePlaces,
            residents,
        }

    } catch (error: any) {
        console.error('Ошибка получения данных:', error);
        throw createError({
            statusCode: error.response?.status || 500,
            message: 'Ошибка получения данных',
        });
    }
});
